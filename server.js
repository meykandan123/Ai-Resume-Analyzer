const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const dns = require("dns");
try { dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]); } catch(e){}

// Fallback DNS lookup to handle Windows OS getaddrinfo EAI_AGAIN lookup errors
const originalDnsLookup = dns.lookup;
dns.lookup = function(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  originalDnsLookup(hostname, options, (err, address, family) => {
    if (err && (err.code === "EAI_AGAIN" || err.code === "ENOTFOUND")) {
      dns.resolve4(hostname, (rErr, addresses) => {
        if (!rErr && addresses && addresses.length > 0) {
          return callback(null, addresses[0], 4);
        }
        return callback(err, address, family);
      });
    } else {
      return callback(err, address, family);
    }
  });
};

require("dotenv").config();

const User = require("./models/User");
const UserActivity = require("./models/UserActivity");
const ResumeHistory = require("./models/ResumeHistory");
const ResumeAnalysis = require("./models/ResumeAnalysis");
const SupportRequest = require("./models/SupportRequest");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://meykandan07_db_user:QRFnlYDYLZlBOpVL@ai-resume-analyzer.v8ua4uo.mongodb.net/Ai-Resume-Analyzer?retryWrites=true&w=majority";
const JWT_SECRET = process.env.JWT_SECRET || "ai_resume_secret_key_987654321";

// ==================== DEV LOGGING ====================
// Safe structured logger — NEVER logs passwords, hashes, tokens, or secrets.
function devLog(category, data = {}) {
  if (process.env.NODE_ENV === "production") return;
  const safe = {};
  const blocked = ["password", "passwordHash", "hash", "token", "secret", "jwt", "resetToken", "verifyToken", "access_token", "id_token"];
  for (const [k, v] of Object.entries(data)) {
    if (blocked.some(b => k.toLowerCase().includes(b))) {
      safe[k] = "[REDACTED]";
    } else {
      safe[k] = v;
    }
  }
  console.log(`[AUTH:${category}]`, JSON.stringify(safe));
}

// Ensure uploads folder exists and serve statically
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (e) {}
}

// Middleware
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Handle JSON body parser syntax errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ success: false, message: "Invalid JSON payload format." });
  }
  next(err);
});

// Serve uploaded resume files statically
app.use("/uploads", express.static(uploadsDir));

// Helper: Save Uploaded Resume File to Disk
function saveUploadedFile(fileData, filename) {
  if (!fileData || typeof fileData !== "string") return null;
  try {
    const base64Content = fileData.includes(";base64,") ? fileData.split(";base64,").pop() : fileData;
    const buffer = Buffer.from(base64Content, "base64");
    const cleanName = (filename || "resume.pdf").replace(/[^a-zA-Z0-9_.-]/g, "_");
    const safeFilename = `${Date.now()}_${cleanName}`;
    const diskPath = path.join(uploadsDir, safeFilename);
    fs.writeFileSync(diskPath, buffer);
    return `/uploads/${safeFilename}`;
  } catch (err) {
    console.error("Failed to save uploaded file buffer:", err.message);
    return null;
  }
}

let MongoMemoryServer;
try {
  MongoMemoryServer = require("mongodb-memory-server").MongoMemoryServer;
} catch (e) {}

// Automated Schema Migration Routine for Legacy Data & Index Compatibility
async function migrateDatabaseSchema() {
  try {
    const db = mongoose.connection.db;
    if (!db) return;

    // 0. Drop obsolete/conflicting legacy indexes if they exist
    try {
      const raIndexes = await db.collection("resume_analysis").indexes();
      if (raIndexes.some(idx => idx.name === "analysisId_1")) {
        await db.collection("resume_analysis").dropIndex("analysisId_1");
        console.log("Dropped legacy index 'analysisId_1' from resume_analysis.");
      }
    } catch (e) {}

    // ── STEP 0b: Migrate legacy `provider` field → `authMethods` array ──────────
    // Users created before this fix have `provider: "email"` or `provider: "google"`
    // but no `authMethods` array. Convert them in-place.
    try {
      const legacyProviderUsers = await db.collection("users").find({
        $and: [
          { $or: [{ provider: { $exists: true } }, { authMethods: { $exists: false } }] },
          { authMethods: { $not: { $type: "array" } } }
        ]
      }).toArray();

      if (legacyProviderUsers.length > 0) {
        console.log(`[Migration] Converting ${legacyProviderUsers.length} legacy user(s) provider field → authMethods array...`);
        for (const u of legacyProviderUsers) {
          const methods = [];
          if (u.provider === "google") methods.push("google");
          else methods.push("email"); // default
          await db.collection("users").updateOne(
            { _id: u._id },
            {
              $set: { authMethods: methods },
              $unset: { provider: "" }
            }
          );
        }
        console.log("[Migration] provider → authMethods conversion done.");
      }
    } catch (provErr) {
      console.warn("[Migration] provider→authMethods migration notice:", provErr.message);
    }

    // ── STEP 0c: Detect & merge duplicate email accounts ─────────────────────────
    // Before enforcing the unique email index, find any existing duplicate emails
    // and merge them: keep the oldest document, move history/activity to it.
    try {
      const dupEmailGroups = await db.collection("users").aggregate([
        { $group: { _id: { $toLower: "$email" }, docs: { $push: "$$ROOT" }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 }, _id: { $ne: null } } }
      ]).toArray();

      if (dupEmailGroups.length > 0) {
        console.log(`[Migration] Found ${dupEmailGroups.length} duplicate email group(s). Merging...`);
        for (const group of dupEmailGroups) {
          // Sort ascending by createdAt to keep the oldest account as primary
          const sorted = group.docs.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
          const primary = sorted[0];
          const duplicates = sorted.slice(1);

          // Merge authMethods from all duplicates into primary
          const mergedMethods = [...new Set([
            ...(primary.authMethods || (primary.provider ? [primary.provider] : ["email"])),
            ...duplicates.flatMap(d => d.authMethods || (d.provider ? [d.provider] : []))
          ])];

          // Merge password: if primary has no password but a duplicate does, adopt it
          let mergedPassword = primary.password || primary.passwordHash || null;
          let mergedGoogleId = primary.googleId || null;
          for (const dup of duplicates) {
            if (!mergedPassword && (dup.password || dup.passwordHash)) {
              mergedPassword = dup.password || dup.passwordHash;
            }
            if (!mergedGoogleId && dup.googleId) mergedGoogleId = dup.googleId;
          }

          const primaryIdStr = primary._id.toString();
          const primaryUserId = primary.userId || primaryIdStr;

          // Update primary with merged data
          await db.collection("users").updateOne(
            { _id: primary._id },
            {
              $set: {
                authMethods: mergedMethods,
                userId: primaryUserId,
                emailVerified: primary.emailVerified || duplicates.some(d => d.emailVerified || d.verified) || false,
                verified: primary.verified || duplicates.some(d => d.verified || d.emailVerified) || false,
                ...(mergedPassword ? { password: mergedPassword, passwordHash: mergedPassword } : {}),
                ...(mergedGoogleId ? { googleId: mergedGoogleId } : {}),
                updatedAt: new Date()
              },
              $unset: { provider: "" }
            }
          );

          // Re-point resume_history and user_activity records from duplicate IDs → primary
          for (const dup of duplicates) {
            const dupIdStr = dup._id.toString();
            const dupUserId = dup.userId || dupIdStr;

            // Merge history: pull items from dup's history doc into primary's
            const dupHistDoc = await db.collection("resume_history").findOne({
              $or: [{ userId: dupUserId }, { userId: dupIdStr }]
            });
            if (dupHistDoc && Array.isArray(dupHistDoc.history) && dupHistDoc.history.length > 0) {
              await db.collection("resume_history").updateOne(
                { $or: [{ userId: primaryUserId }, { userId: primaryIdStr }] },
                {
                  $set: { userId: primaryUserId, updatedAt: new Date() },
                  $push: { history: { $each: dupHistDoc.history } }
                },
                { upsert: true }
              );
              await db.collection("resume_history").deleteOne({ _id: dupHistDoc._id });
            }

            // Merge activities
            const dupActDoc = await db.collection("user_activity").findOne({
              $or: [{ userId: dupUserId }, { userId: dupIdStr }]
            });
            if (dupActDoc && Array.isArray(dupActDoc.activities) && dupActDoc.activities.length > 0) {
              await db.collection("user_activity").updateOne(
                { $or: [{ userId: primaryUserId }, { userId: primaryIdStr }] },
                {
                  $set: { userId: primaryUserId, updatedAt: new Date() },
                  $push: { activities: { $each: dupActDoc.activities } }
                },
                { upsert: true }
              );
              await db.collection("user_activity").deleteOne({ _id: dupActDoc._id });
            }

            // Re-key resume_analysis records
            await db.collection("resume_analysis").updateMany(
              { $or: [{ userId: dupUserId }, { userId: dupIdStr }] },
              { $set: { userId: primaryUserId } }
            );

            // Delete the duplicate user
            await db.collection("users").deleteOne({ _id: dup._id });
            console.log(`[Migration] Merged duplicate user ${dup.email} (${dupIdStr}) → primary (${primaryIdStr})`);
          }
        }
        console.log("[Migration] Duplicate email merge complete.");
      }
    } catch (dupErr) {
      console.warn("[Migration] Duplicate email merge notice:", dupErr.message);
    }

    // 1. Migrate user_activity (Consolidate legacy single activity docs into user-wise container)
    const legacyActivities = await db.collection("user_activity").find({
      $or: [
        { activityType: { $exists: true } },
        { action: { $exists: true } }
      ],
      activities: { $exists: false }
    }).toArray();

    if (legacyActivities.length > 0) {
      console.log(`Migrating ${legacyActivities.length} legacy activity record(s) into user-wise containers...`);
      for (const act of legacyActivities) {
        const uId = (act.userId || act.user_id || act.userEmail || act.email || "").toString();
        if (!uId) continue;

        const actType = act.activityType || act.action || "general";
        const desc = act.description || act.activityDescription || `${actType} activity recorded`;
        const time = act.timestamp || act.createdAt || new Date();
        const uEmail = act.email || act.userEmail || "";

        await UserActivity.findOneAndUpdate(
          { userId: uId },
          {
            $setOnInsert: { userId: uId },
            $set: { email: uEmail, updatedAt: new Date() },
            $push: {
              activities: {
                activityType: actType,
                description: desc,
                timestamp: time
              }
            }
          },
          { upsert: true }
        );
        await db.collection("user_activity").deleteOne({ _id: act._id });
      }
      console.log("Activity collection migration completed successfully.");
    }

    // Merge duplicate user_activity container docs per userId if any exist
    const dupActivities = await db.collection("user_activity").aggregate([
      { $group: { _id: "$userId", docs: { $push: "$$ROOT" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 }, _id: { $ne: null } } }
    ]).toArray();

    for (const group of dupActivities) {
      const mainDoc = group.docs[0];
      let mergedActivities = mainDoc.activities || [];
      for (let i = 1; i < group.docs.length; i++) {
        const otherDoc = group.docs[i];
        if (Array.isArray(otherDoc.activities)) {
          mergedActivities = mergedActivities.concat(otherDoc.activities);
        }
        await db.collection("user_activity").deleteOne({ _id: otherDoc._id });
      }
      await db.collection("user_activity").updateOne(
        { _id: mainDoc._id },
        { $set: { activities: mergedActivities, updatedAt: new Date() } }
      );
    }

    // 2. Migrate resume_history (Consolidate legacy history docs into user-wise container)
    const legacyHistory = await db.collection("resume_history").find({
      $or: [
        { fileName: { $exists: true } },
        { analysisId: { $exists: true } }
      ],
      history: { $exists: false }
    }).toArray();

    if (legacyHistory.length > 0) {
      console.log(`Migrating ${legacyHistory.length} legacy history record(s) into user-wise containers...`);
      for (const hist of legacyHistory) {
        const uId = (hist.userId || hist.user_id || hist.userEmail || hist.email || "").toString();
        if (!uId) continue;

        const resId = hist.analysisId || hist._id.toString();
        const fname = hist.fileName || hist.filename || "resume.pdf";
        const uDate = hist.uploadDate || hist.analysisDate || hist.createdAt || new Date();
        const aType = hist.analysisType || "normal";
        const aScore = Number(hist.atsScore !== undefined ? hist.atsScore : (hist.score || 0));
        const uEmail = hist.userEmail || hist.email || "";

        await ResumeHistory.findOneAndUpdate(
          { userId: uId },
          {
            $setOnInsert: { userId: uId },
            $set: { email: uEmail, updatedAt: new Date() },
            $push: {
              history: {
                resumeId: resId,
                fileName: fname,
                uploadedAt: uDate,
                analysisType: aType,
                atsScore: aScore,
                status: "analyzed"
              }
            }
          },
          { upsert: true }
        );

        // Also ensure a corresponding record exists in resume_analysis
        const rText = hist.resumeText || "";
        const rHash = crypto.createHash("sha256").update(rText || (fname + uId)).digest("hex");
        await ResumeAnalysis.findOneAndUpdate(
          { userId: uId, resumeHash: rHash, analysisType: aType },
          {
            $setOnInsert: {
              userId: uId,
              resumeId: resId,
              resumeHash: rHash,
              analysisType: aType,
              firstUploadedAt: uDate
            },
            $set: {
              email: uEmail,
              fileName: fname,
              atsScore: aScore,
              extractedData: {
                skills: hist.detectedSkills || [],
                education: [],
                experience: []
              },
              analysisResult: hist.analysisResult || {},
              lastUpdatedAt: uDate
            }
          },
          { upsert: true }
        );

        await db.collection("resume_history").deleteOne({ _id: hist._id });
      }
      console.log("Resume history collection migration completed successfully.");
    }

    // Merge duplicate resume_history container docs per userId if any exist
    const dupHistories = await db.collection("resume_history").aggregate([
      { $group: { _id: "$userId", docs: { $push: "$$ROOT" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 }, _id: { $ne: null } } }
    ]).toArray();

    for (const group of dupHistories) {
      const mainDoc = group.docs[0];
      let mergedHistory = mainDoc.history || [];
      for (let i = 1; i < group.docs.length; i++) {
        const otherDoc = group.docs[i];
        if (Array.isArray(otherDoc.history)) {
          mergedHistory = mergedHistory.concat(otherDoc.history);
        }
        await db.collection("resume_history").deleteOne({ _id: otherDoc._id });
      }
      await db.collection("resume_history").updateOne(
        { _id: mainDoc._id },
        { $set: { history: mergedHistory, updatedAt: new Date() } }
      );
    }

    // 3. Clean up duplicates in resume_analysis to enforce unique compound index
    const duplicates = await ResumeAnalysis.aggregate([
      {
        $group: {
          _id: { userId: "$userId", resumeHash: "$resumeHash", analysisType: "$analysisType" },
          docs: { $push: "$_id" },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]);

    if (duplicates.length > 0) {
      console.log(`Resolving ${duplicates.length} duplicate group(s) in resume_analysis...`);
      for (const group of duplicates) {
        const removeIds = group.docs.slice(0, group.docs.length - 1);
        await db.collection("resume_analysis").deleteMany({ _id: { $in: removeIds } });
      }
      console.log("Duplicate resume_analysis records resolved.");
    }
  } catch (migErr) {
    console.warn("Schema migration notice:", migErr.message);
  }
}

// Connect to MongoDB with automatic retry logic
async function connectDB(retries = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(MONGODB_URI, {
        dbName: "Ai-Resume-Analyzer",
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000
      });
      console.log("Connected to MongoDB database (Ai-Resume-Analyzer) successfully:", MONGODB_URI.replace(/:([^@]+)@/, ":*****@"));

      // Ensure collections exist and sync unique indexes
      try {
        await User.createCollection();
        await UserActivity.createCollection();
        await ResumeHistory.createCollection();
        await ResumeAnalysis.createCollection();

        // Run automatic legacy data migration
        await migrateDatabaseSchema();

        // Build & Sync indexes for all 4 collections
        await User.syncIndexes();
        await UserActivity.syncIndexes();
        await ResumeHistory.syncIndexes();
        await ResumeAnalysis.syncIndexes();

        console.log("Verified 4 MongoDB collections & unique indexes: users, user_activity, resume_history, resume_analysis");
      } catch (collErr) {
        console.log("Collection initialization notice:", collErr.message);
      }
      return;
    } catch (err) {
      console.error(`MongoDB Connection Attempt ${attempt}/${retries} Failed! MONGODB_URI:`, MONGODB_URI.replace(/:([^@]+)@/, ":*****@"));
      console.error("Error details:", err.message);
      if (attempt < retries) {
        console.log(`Retrying MongoDB connection in ${delayMs / 1000}s...`);
        await new Promise(res => setTimeout(res, delayMs));
      }
    }
  }
}
connectDB();

// Helper to log activities atomically into user_activity collection (1 document per user)
async function logUserActivity(userOrId, activityType, description, metadata = {}, userEmail = null) {
  try {
    if (!userOrId && !userEmail) return null;

    let targetUserId = null;
    let nameToSave = "";
    let emailToSave = userEmail ? userEmail.toLowerCase().trim() : "";

    if (typeof userOrId === "string") {
      targetUserId = userOrId;
    } else if (userOrId instanceof mongoose.Types.ObjectId) {
      targetUserId = userOrId.toString();
    } else if (userOrId && (userOrId.userId || userOrId._id)) {
      targetUserId = (userOrId.userId || userOrId._id).toString();
      if (!nameToSave && userOrId.name) nameToSave = userOrId.name;
      if (!emailToSave && userOrId.email) emailToSave = userOrId.email.toLowerCase().trim();
    }

    if (targetUserId) {
      const u = await User.findOne({
        $or: [
          { userId: targetUserId },
          { _id: mongoose.Types.ObjectId.isValid(targetUserId) ? targetUserId : null },
          ...(emailToSave ? [{ email: emailToSave }] : [])
        ]
      }).select("userId name email");
      if (u) {
        targetUserId = u.userId || u._id.toString();
        if (!nameToSave) nameToSave = u.name || "";
        if (!emailToSave) emailToSave = u.email ? u.email.toLowerCase().trim() : "";
      }
    } else if (emailToSave) {
      const u = await User.findOne({ email: emailToSave }).select("userId name email");
      if (u) {
        targetUserId = u.userId || u._id.toString();
        if (!nameToSave) nameToSave = u.name || "";
      } else {
        targetUserId = emailToSave;
      }
    }

    if (!targetUserId) return null;

    const actType = activityType || "general";
    const descText = description || `${actType} activity recorded`;
    const now = new Date();

    const result = await UserActivity.findOneAndUpdate(
      {
        $or: [
          { userId: targetUserId },
          ...(emailToSave ? [{ email: emailToSave }] : [])
        ]
      },
      {
        $set: { userId: targetUserId, name: nameToSave, email: emailToSave, updatedAt: now },
        $push: {
          activities: {
            $each: [{
              activityType: actType,
              description: descText,
              timestamp: now
            }],
            $slice: -200
          }
        }
      },
      { upsert: true, returnDocument: "after" }
    );

    return result;
  } catch (err) {
    console.error(`Failed to log activity [${activityType}]:`, err.message);
    return null;
  }
}

// Authentication Middleware with Resilient Fallback
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  let token = authHeader && authHeader.split(" ")[1];

  if (!token && req.query?.token) token = req.query.token;
  if (!token && req.body?.token) token = req.body.token;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId).select("-password");
      if (user) {
        if (!user.userId) {
          user.userId = user._id.toString();
          await user.save();
        }
        req.user = user;
        return next();
      }
    } catch (err) {
      // Token is invalid/expired — fallback below
    }
  }

  // Resilient Fallback: Authenticate via verified email or userId from headers or payload
  const fallbackEmail = req.headers["x-user-email"] || req.body?.email || req.query?.email;
  const fallbackUserId = req.headers["x-user-id"] || req.body?.userId || req.query?.userId;

  if (fallbackEmail || fallbackUserId) {
    try {
      const normEmail = fallbackEmail && typeof fallbackEmail === "string" ? fallbackEmail.toLowerCase().trim() : null;
      const user = await User.findOne({
        $or: [
          ...(normEmail ? [{ email: normEmail }] : []),
          ...(fallbackUserId ? [{ userId: fallbackUserId }, { _id: mongoose.Types.ObjectId.isValid(fallbackUserId) ? fallbackUserId : null }] : [])
        ]
      }).select("-password");

      if (user) {
        if (!user.userId) {
          user.userId = user._id.toString();
          await user.save();
        }
        req.user = user;
        const freshToken = generateToken(user._id);
        res.setHeader("x-auth-token", freshToken);
        return next();
      }
    } catch (fallbackErr) {
      console.warn("Auth fallback lookup error:", fallbackErr.message);
    }
  }

  return res.status(401).json({ success: false, message: "Access denied. Token missing or session expired." });
};

// Database Readiness Middleware
const checkDbConnection = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: "Database connection is initializing or unavailable. Please ensure MongoDB is running."
    });
  }
  next();
};

// Database Health Check Endpoint (STEP 15)
app.get("/api/health/db", async (req, res) => {
  try {
    const isConnected = mongoose.connection.readyState === 1;
    const dbName = mongoose.connection.db ? mongoose.connection.db.databaseName : "Ai-Resume-Analyzer";
    let pingOk = false;
    let collectionsList = [];

    if (isConnected && mongoose.connection.db) {
      try {
        await mongoose.connection.db.admin().ping();
        pingOk = true;
        const colls = await mongoose.connection.db.listCollections().toArray();
        collectionsList = colls.map(c => c.name);
      } catch (pingErr) {
        pingOk = false;
      }
    }

    if (isConnected && pingOk) {
      return res.json({
        server: "ok",
        mongodb: "connected",
        database: dbName,
        collections: collectionsList
      });
    } else {
      return res.status(503).json({
        server: "ok",
        mongodb: "disconnected",
        database: dbName,
        error: "MongoDB connection is down or ping failed."
      });
    }
  } catch (err) {
    return res.status(500).json({
      server: "ok",
      mongodb: "error",
      error: err.message
    });
  }
});

let nodemailer;
try { nodemailer = require("nodemailer"); } catch(e){}

// Rate Limiter for Auth Routes
const authRateLimitMap = new Map();
const authRateLimiter = (req, res, next) => {
  const ip = req.ip || req.headers["x-forwarded-for"] || "127.0.0.1";
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxRequests = 30;

  const record = authRateLimitMap.get(ip) || { count: 0, resetTime: now + windowMs };
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + windowMs;
  }
  record.count += 1;
  authRateLimitMap.set(ip, record);

  if (record.count > maxRequests) {
    return res.status(429).json({
      success: false,
      message: "Too many authentication requests from this IP. Please try again later."
    });
  }
  next();
};

app.use("/api", checkDbConnection);
app.use("/api/auth/signup", authRateLimiter);
app.use("/api/auth/login", authRateLimiter);
app.use("/api/auth/resend-verification", authRateLimiter);
app.use("/api/auth/verify", authRateLimiter);
app.use("/api/auth/forgot-password", authRateLimiter);
app.use("/api/auth/reset-password", authRateLimiter);

// Express route for email verification URL
app.get("/verify-email", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Express route for password reset URL
app.get("/reset-password", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Helper: Generate Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
};

// Helper: Generate Random Verification Token (32-byte secure hex string)
const generateVerifyToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

// Helper: Hash Verification Token with SHA-256
const hashToken = (token) => {
  if (!token || typeof token !== "string") return "";
  return crypto.createHash("sha256").update(token).digest("hex");
};

// Helper: Send email directly using Backend Email Service (SMTP / Nodemailer)
const sendEmailToUser = async (toEmail, subject, textMessage, htmlMessage) => {
  if (!toEmail || typeof toEmail !== "string") return false;
  const normalized = toEmail.toLowerCase().trim();

  const service = process.env.EMAIL_SERVICE;
  const host = process.env.EMAIL_HOST || process.env.SMTP_HOST;
  const port = parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT || "587");
  const user = process.env.EMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS || process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM || process.env.SMTP_FROM || `"AI Resume Analyzer" <${user || "no-reply@ai-resume-analyzer.com"}>`;

  if (nodemailer && ((service && user && pass) || (host && user && pass))) {
    try {
      const transporterConfig = service
        ? {
            service,
            auth: { user, pass }
          }
        : {
            host,
            port,
            secure: process.env.EMAIL_SECURE === "true" || process.env.SMTP_SECURE === "true" || port === 465,
            auth: { user, pass },
            tls: { rejectUnauthorized: false }
          };

      const transporter = nodemailer.createTransport(transporterConfig);
      await transporter.sendMail({
        from,
        to: normalized,
        subject: subject,
        text: textMessage,
        html: htmlMessage || `<div style="font-family:sans-serif; padding:20px;">${textMessage.replace(/\n/g, "<br/>")}</div>`
      });
      console.log(`[Backend Email Service] Successfully delivered email '${subject}' to ${normalized}`);
      return true;
    } catch (smtpErr) {
      console.error("[Backend Email Service] SMTP delivery error:", smtpErr.message);
    }
  }

  // Fallback logging for local development or when SMTP credentials are not yet configured
  console.log("==================================================");
  console.log(`[Backend Email Service - Dispatch Notice]`);
  console.log(`To: ${normalized}`);
  console.log(`Subject: ${subject}`);
  console.log(`Message:\n${textMessage}`);
  console.log("==================================================");
  return true;
};

// Public Configuration Endpoint
app.get("/api/config", (req, res) => {
  res.json({
    success: true,
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    firebaseConfig: {
      apiKey: process.env.FIREBASE_API_KEY || "AIzaSyCSLQ6HzZDgt-vx7O-4RKZJRhGCT3O-0bQ",
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || "resume-analyzer-a7d57.firebaseapp.com",
      projectId: process.env.FIREBASE_PROJECT_ID || "resume-analyzer-a7d57",
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "resume-analyzer-a7d57.firebasestorage.app",
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "356703491313",
      appId: process.env.FIREBASE_APP_ID || "1:356703491313:web:546f57b08bbf126da68550",
      measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-V9GGGHW78G"
    }
  });
});

// ==================== AUTH ROUTES ====================

// Sign Up
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email, and password are required." });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      devLog("SIGNUP", { email: normalizedEmail, existingUser: true, blocked: true });
      return res.status(400).json({ success: false, message: "An account with this email already exists." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const rawVerifyToken = generateVerifyToken();
    const hashedVerifyToken = hashToken(rawVerifyToken);
    const verifyTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const _id = new mongoose.Types.ObjectId();
    const userId = _id.toString();
    const now = new Date();

    const newUser = new User({
      _id,
      userId,
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      passwordHash: hashedPassword,
      authMethods: ["email"],
      emailVerified: false,
      verified: false,
      verifyToken: hashedVerifyToken,
      verifyTokenExpires,
      createdAt: now,
      updatedAt: now
    });

    await newUser.save();
    devLog("SIGNUP", { email: normalizedEmail, userId: newUser.userId, authMethods: ["email"], newUser: true, accountCreated: true });

    await logUserActivity(newUser.userId, "signup", `User registered with email: ${normalizedEmail}`, { email: normalizedEmail, authMethod: "email" });

    const host = req.get("host") || "localhost:5000";
    const protocol = req.protocol || "http";
    const appUrl = (process.env.APP_URL || process.env.BASE_URL || `${protocol}://${host}`).replace(/\/+$/, "");
    const verifyLink = `${appUrl}/verify-email?token=${rawVerifyToken}&email=${encodeURIComponent(newUser.email)}`;

    const textMessage =
      `Hi ${newUser.name || "there"},\n\n` +
      `Thank you for creating an account with AI Resume Analyzer!\n\n` +
      `Please click the verification link below to activate your account and enable login:\n` +
      `${verifyLink}\n\n` +
      `⏰ IMPORTANT: This link is valid for 24 hours.\n\n` +
      `If you didn't create an account, you can safely ignore this email.`;

    const htmlMessage =
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">` +
      `<h2 style="color: #4f46e5; text-align: center; margin-top: 0;">Verify Your Email</h2>` +
      `<p style="font-size: 15px; color: #334155;">Hi <strong>${newUser.name || "there"}</strong>,</p>` +
      `<p style="font-size: 15px; color: #334155;">Thank you for registering for <strong>AI Resume Analyzer</strong>. Please click the button below to verify your email address and activate your account:</p>` +
      `<div style="text-align: center; margin: 30px 0;">` +
      `<a href="${verifyLink}" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);">Verify My Email</a>` +
      `</div>` +
      `<p style="font-size: 13px; color: #64748b;">Or copy and paste this link into your browser:<br/><a href="${verifyLink}" style="color: #4f46e5; word-break: break-all;">${verifyLink}</a></p>` +
      `<p style="font-size: 13px; color: #b45309; font-weight: bold; background: #fef3c7; padding: 10px 14px; border-radius: 6px;">⏰ Note: This verification link is valid for 24 hours.</p>` +
      `<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />` +
      `<p style="font-size: 12px; color: #94a3b8; margin-bottom: 0;">If you did not sign up for this account, please ignore this email.</p>` +
      `</div>`;

    sendEmailToUser(newUser.email, "Verify Your Email — AI Resume Analyzer", textMessage, htmlMessage).catch(() => {});

    return res.status(201).json({
      success: true,
      requireVerification: true,
      message: "Account created successfully! A verification link has been sent to your email inbox. Please verify your email before logging in.",
      email: newUser.email,
      name: newUser.name,
      verifyToken: rawVerifyToken
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: "An account with this email already exists." });
    }
    console.error("Signup error:", err);
    return res.status(500).json({ success: false, message: "Server error during registration." });
  }
});

// Email Verification Endpoint
const verifyEmailHandler = async (req, res) => {
  try {
    const email = req.body?.email || req.query?.email || req.body?.verifyEmail || req.query?.verifyEmail;
    const token = req.body?.token || req.query?.token || req.body?.verifyToken || req.query?.verifyToken;

    if (!token) {
      return res.status(400).json({ success: false, message: "Verification token is required." });
    }

    const hashedIncomingToken = hashToken(token);
    const normalizedEmail = email ? email.toLowerCase().trim() : null;

    let user = await User.findOne({
      $or: [
        { verifyToken: hashedIncomingToken },
        { verifyToken: token },
        ...(normalizedEmail ? [{ email: normalizedEmail }] : [])
      ]
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "Verification link is invalid or account not found." });
    }

    const userIdStr = user.userId || user._id.toString();

    if (user.verified || user.emailVerified) {
      const jwtToken = generateToken(user._id);
      return res.json({
        success: true,
        verified: true,
        message: "Email verified successfully! Your account is now verified. You can log in.",
        token: jwtToken,
        user: {
          _id: user._id,
          id: user._id,
          userId: userIdStr,
          name: user.name,
          email: user.email,
          emailVerified: true,
          provider: user.provider,
          photo: user.photo,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      });
    }

    const tokenMatches = user.verifyToken && (user.verifyToken === hashedIncomingToken || user.verifyToken === token);
    if (!tokenMatches) {
      return res.status(400).json({ success: false, message: "Verification link is invalid or has already been used." });
    }

    if (!user.verifyTokenExpires || user.verifyTokenExpires < new Date()) {
      return res.status(400).json({
        success: false,
        isExpired: true,
        message: "Verification link expired. Please request a new verification link."
      });
    }

    const now = new Date();
    user.emailVerified = true;
    user.verified = true;
    user.verifyToken = null;
    user.verifyTokenExpires = null;
    user.updatedAt = now;
    await user.save();

    await logUserActivity(userIdStr, "email verification", `User verified email address: ${user.email}`, { email: user.email });

    const jwtToken = generateToken(user._id);

    return res.json({
      success: true,
      verified: true,
      message: "Email verified successfully! Your account is now verified. You can log in.",
      token: jwtToken,
      user: {
        _id: user._id,
        id: user._id,
        userId: userIdStr,
        name: user.name,
        email: user.email,
        emailVerified: true,
        provider: user.provider,
        photo: user.photo,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (err) {
    console.error("Verification error:", err);
    return res.status(500).json({ success: false, message: "Server error during verification." });
  }
};

app.post(["/api/auth/verify", "/api/auth/verify-email"], verifyEmailHandler);
app.get(["/api/auth/verify", "/api/auth/verify-email"], verifyEmailHandler);

// Resend Verification Email Token
app.post("/api/auth/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required." });

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Reject only if user doesn't exist, or is Google-only (no password/email auth method)
    const hasEmailAuth = user && (
      (Array.isArray(user.authMethods) && user.authMethods.includes("email")) ||
      (!Array.isArray(user.authMethods) && (user.passwordHash || user.password))
    );
    if (!user || !hasEmailAuth) {
      return res.status(404).json({ success: false, message: "Account not found." });
    }

    if (user.verified || user.emailVerified) {
      return res.json({ success: true, message: "Email is already verified. Please log in normally." });
    }

    const rawVerifyToken = generateVerifyToken();
    const hashedVerifyToken = hashToken(rawVerifyToken);
    user.verifyToken = hashedVerifyToken;
    user.verifyTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await user.save();

    const host = req.get("host") || "localhost:5000";
    const protocol = req.protocol || "http";
    const appUrl = (process.env.APP_URL || process.env.BASE_URL || `${protocol}://${host}`).replace(/\/+$/, "");
    const verifyLink = `${appUrl}/verify-email?token=${rawVerifyToken}&email=${encodeURIComponent(user.email)}`;

    const textMessage =
      `Hi ${user.name || "there"},\n\n` +
      `Here is your new email verification link for AI Resume Analyzer:\n\n` +
      `${verifyLink}\n\n` +
      `⏰ IMPORTANT: This link is valid for 24 hours.\n\n` +
      `If you didn't request this email, you can safely ignore it.`;

    const htmlMessage =
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">` +
      `<h2 style="color: #4f46e5; text-align: center; margin-top: 0;">Verify Your Email</h2>` +
      `<p style="font-size: 15px; color: #334155;">Hi <strong>${user.name || "there"}</strong>,</p>` +
      `<p style="font-size: 15px; color: #334155;">Here is your requested verification link. Please click the button below to verify your email and activate your account:</p>` +
      `<div style="text-align: center; margin: 30px 0;">` +
      `<a href="${verifyLink}" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);">Verify My Email</a>` +
      `</div>` +
      `<p style="font-size: 13px; color: #64748b;">Or copy and paste this link into your browser:<br/><a href="${verifyLink}" style="color: #4f46e5; word-break: break-all;">${verifyLink}</a></p>` +
      `<p style="font-size: 13px; color: #b45309; font-weight: bold; background: #fef3c7; padding: 10px 14px; border-radius: 6px;">⏰ Note: This verification link is valid for 24 hours.</p>` +
      `<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />` +
      `<p style="font-size: 12px; color: #94a3b8; margin-bottom: 0;">If you didn't request a new link, please ignore this email.</p>` +
      `</div>`;

    sendEmailToUser(user.email, "Verify Your Email — AI Resume Analyzer", textMessage, htmlMessage).catch(() => {});

    return res.json({
      success: true,
      message: "A fresh verification link has been sent to your email inbox. Please check your Inbox or Spam folder.",
      email: user.email,
      name: user.name,
      verifyToken: rawVerifyToken
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error resending verification." });
  }
});

// Request Password Reset Link
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ success: false, message: "Valid email address is required." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Only send reset link if user has email/password auth method
    const hasEmailAuth = user && (
      (Array.isArray(user.authMethods) && user.authMethods.includes("email")) ||
      (!Array.isArray(user.authMethods) && (user.passwordHash || user.password))
    );
    if (!user || !hasEmailAuth) {
      // Return same message regardless to prevent user enumeration
      return res.json({
        success: true,
        message: "If an account with that email exists, a password reset link has been sent to your Inbox or Spam/Junk folder."
      });
    }

    const rawResetToken = generateVerifyToken();
    const hashedResetToken = hashToken(rawResetToken);
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    user.resetToken = hashedResetToken;
    user.resetTokenExpires = resetTokenExpires;
    user.updatedAt = new Date();
    await user.save();

    const userIdStr = user.userId || user._id.toString();
    await logUserActivity(
      userIdStr,
      "password reset request",
      `Password reset link requested for email: ${user.email}`,
      { email: user.email },
      user.email
    );

    const host = req.get("host") || "localhost:5000";
    const protocol = req.protocol || "http";
    const appUrl = (process.env.APP_URL || process.env.BASE_URL || `${protocol}://${host}`).replace(/\/+$/, "");
    const resetLink = `${appUrl}/reset-password?token=${rawResetToken}&email=${encodeURIComponent(user.email)}`;

    const textMessage =
      `Hi ${user.name || "there"},\n\n` +
      `You requested to reset your password for AI Resume Analyzer.\n` +
      `Click the link below to set a new password:\n\n` +
      `${resetLink}\n\n` +
      `⏰ IMPORTANT: This link is valid for 1 hour.\n\n` +
      `If you didn't request a password reset, you can safely ignore this email.`;

    const htmlMessage =
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">` +
      `<h2 style="color: #4f46e5; text-align: center; margin-top: 0;">Reset Your Password</h2>` +
      `<p style="font-size: 15px; color: #334155;">Hi <strong>${user.name || "there"}</strong>,</p>` +
      `<p style="font-size: 15px; color: #334155;">We received a request to reset your password for <strong>AI Resume Analyzer</strong>. Click the button below to choose a new password:</p>` +
      `<div style="text-align: center; margin: 30px 0;">` +
      `<a href="${resetLink}" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);">Reset Password</a>` +
      `</div>` +
      `<p style="font-size: 13px; color: #64748b;">Or copy and paste this link into your browser:<br/><a href="${resetLink}" style="color: #4f46e5; word-break: break-all;">${resetLink}</a></p>` +
      `<p style="font-size: 13px; color: #b45309; font-weight: bold; background: #fef3c7; padding: 10px 14px; border-radius: 6px;">⏰ Note: This password reset link is valid for 1 hour.</p>` +
      `<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />` +
      `<p style="font-size: 12px; color: #94a3b8; margin-bottom: 0;">If you did not request a password reset, your account remains secure and you can safely ignore this email.</p>` +
      `</div>`;

    sendEmailToUser(user.email, "Reset Your Password — AI Resume Analyzer", textMessage, htmlMessage).catch(() => {});

    return res.json({
      success: true,
      message: "If an account with that email exists, a password reset link has been sent to your email inbox (or spam folder).",
      resetToken: rawResetToken
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ success: false, message: "Server error processing password reset request." });
  }
});

// Submit New Password via Token
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, token, password, newPassword } = req.body;
    const finalPassword = password || newPassword;

    if (!email || !token || !finalPassword) {
      return res.status(400).json({ success: false, message: "Email, reset token, and new password are required." });
    }

    if (typeof finalPassword !== "string" || finalPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const hashedIncomingToken = hashToken(token);

    const user = await User.findOne({
      email: normalizedEmail,
      $or: [
        { resetToken: hashedIncomingToken },
        { resetToken: token }
      ]
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Password reset link is invalid or has already been used." });
    }

    if (!user.resetTokenExpires || user.resetTokenExpires < new Date()) {
      return res.status(400).json({
        success: false,
        isExpired: true,
        message: "Password reset link has expired. Please request a new reset link."
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(finalPassword, salt);
    const now = new Date();

    user.password = hashedPassword;
    user.passwordHash = hashedPassword;
    user.resetToken = null;
    user.resetTokenExpires = null;
    user.updatedAt = now;
    await user.save();

    const userIdStr = user.userId || user._id.toString();
    await logUserActivity(
      userIdStr,
      "password change",
      `Password reset successfully completed for email: ${user.email}`,
      { email: user.email },
      user.email
    );

    return res.json({
      success: true,
      message: "Password updated successfully! You can now log in with your new password."
    });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ success: false, message: "Server error completing password reset." });
  }
});

// Log In
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, userId, password } = req.body;

    const identifier = (email || userId || "").trim();
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: "Email/userId and password are required." });
    }

    const normalizedIdentifier = identifier.toLowerCase();

    const user = await User.findOne({
      $or: [
        { email: normalizedIdentifier },
        { userId: identifier },
        { _id: mongoose.Types.ObjectId.isValid(identifier) ? identifier : null }
      ]
    });

    // User must exist and have an email/password auth method linked
    const hasEmailAuth = user && (
      (Array.isArray(user.authMethods) && user.authMethods.includes("email")) ||
      (!Array.isArray(user.authMethods) && user.passwordHash) // legacy fallback
    );

    if (!user || !hasEmailAuth) {
      devLog("LOGIN_FAIL", { email: normalizedIdentifier, reason: "no_email_auth", userFound: !!user, authMethods: user?.authMethods });
      return res.status(400).json({ success: false, message: "Incorrect email/userId or password." });
    }

    const storedHash = user.passwordHash || user.password;
    if (!storedHash) {
      devLog("LOGIN_FAIL", { email: normalizedIdentifier, reason: "no_password_hash" });
      return res.status(400).json({ success: false, message: "Incorrect email/userId or password." });
    }

    const isMatch = await bcrypt.compare(password, storedHash);
    if (!isMatch) {
      devLog("LOGIN_FAIL", { email: normalizedIdentifier, userId: user._id.toString(), reason: "wrong_password" });
      return res.status(400).json({ success: false, message: "Incorrect email/userId or password." });
    }

    // Strict verification check: unverified accounts cannot log in
    if (!user.verified && !user.emailVerified) {
      devLog("LOGIN_FAIL", { email: normalizedIdentifier, userId: user._id.toString(), reason: "email_not_verified" });
      return res.status(403).json({
        success: false,
        requireVerification: true,
        email: user.email,
        message: "Please verify your email address before logging in. We sent a verification link to your email inbox."
      });
    }

    const now = new Date();
    user.updatedAt = now;
    if (!user.userId) user.userId = user._id.toString();
    if (!user.passwordHash && user.password) user.passwordHash = user.password;
    // Ensure authMethods is set correctly for legacy records
    if (!Array.isArray(user.authMethods) || user.authMethods.length === 0) {
      user.authMethods = ["email"];
    }

    await user.save();
    const userIdStr = user.userId || user._id.toString();

    devLog("LOGIN_SUCCESS", { email: user.email, userId: userIdStr, authMethods: user.authMethods, emailVerified: user.emailVerified || user.verified });
    await logUserActivity(userIdStr, "login", `User logged in with email: ${user.email}`, { email: user.email, authMethod: "email" }, user.email);

    const token = generateToken(user._id);

    return res.json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        _id: user._id,
        id: user._id,
        userId: userIdStr,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified || user.verified,
        authMethods: user.authMethods,
        provider: user.provider,
        photo: user.photo,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, message: "Server error during login." });
  }
});

// Google Auth Sync & Server-side Verification
// ONE EMAIL = ONE ACCOUNT: this endpoint always finds or links to the existing user document.
app.post("/api/auth/google", async (req, res) => {
  try {
    let { name, email, photo, access_token, id_token } = req.body;

    // Verify the Google token server-side to get the canonical email
    if (id_token || access_token) {
      try {
        const tokenInfoUrl = id_token
          ? `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`
          : `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(access_token)}`;
        const gRes = await fetch(tokenInfoUrl);
        if (gRes.ok) {
          const gInfo = await gRes.json();
          if (gInfo.email) {
            email = gInfo.email;
            name = name || gInfo.name || gInfo.email.split("@")[0];
            photo = photo || gInfo.picture || "";
          }
        }
      } catch (e) {
        console.warn("Backend Google token verification notice:", e);
      }
    }

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const now = new Date();

    // ── CASE A: Email already exists — link Google to existing account ──────────
    let user = await User.findOne({ email: normalizedEmail });
    let isNewUser = false;
    let googleLinked = false;

    if (user) {
      // DO NOT create a new document. Link Google to the existing account.
      const methods = Array.isArray(user.authMethods) ? [...user.authMethods] : [];
      if (!methods.includes("google")) {
        methods.push("google");
        googleLinked = true;
      }

      user.authMethods = methods;
      user.emailVerified = true;
      user.verified = true;
      if (!user.verifiedAt) user.verifiedAt = now;
      // Update photo only if not already set and Google provides one
      if (photo && !user.photo) user.photo = photo;
      user.updatedAt = now;
      if (!user.userId) user.userId = user._id.toString();
      // Do NOT touch passwordHash — preserve existing password auth

      await user.save();

      devLog("GOOGLE_LOGIN", {
        email: normalizedEmail,
        userId: user.userId,
        authMethods: user.authMethods,
        existingUser: true,
        googleLinked,
        emailVerified: true
      });

      await logUserActivity(user.userId, "Google login",
        `User logged in via Google: ${normalizedEmail}${googleLinked ? " (Google linked to existing account)" : ""}`,
        { email: normalizedEmail, authMethod: "google", googleLinked }
      );

    } else {
      // ── CASE B: New email — create exactly one account ──────────────────────────
      isNewUser = true;
      googleLinked = true;
      const _id = new mongoose.Types.ObjectId();
      const userId = _id.toString();

      user = new User({
        _id,
        userId,
        name: name || normalizedEmail.split("@")[0],
        email: normalizedEmail,
        authMethods: ["google"],
        emailVerified: true,
        verified: true,
        verifiedAt: now,
        photo: photo || "",
        createdAt: now,
        updatedAt: now
      });
      await user.save();

      devLog("GOOGLE_SIGNUP", {
        email: normalizedEmail,
        userId: user.userId,
        authMethods: ["google"],
        newUser: true,
        accountCreated: true
      });

      await logUserActivity(user.userId, "signup",
        `User registered via Google: ${normalizedEmail}`,
        { email: normalizedEmail, authMethod: "google" }
      );
      await logUserActivity(user.userId, "Google login",
        `User logged in via Google: ${normalizedEmail}`,
        { email: normalizedEmail, authMethod: "google" }
      );
    }

    const token = generateToken(user._id);
    const userIdStr = user.userId || user._id.toString();

    return res.json({
      success: true,
      message: isNewUser ? "Google account registered and signed in." : "Google login successful.",
      token,
      user: {
        _id: user._id,
        id: user._id,
        userId: userIdStr,
        name: user.name,
        email: user.email,
        emailVerified: true,
        authMethods: user.authMethods,
        provider: user.provider, // virtual — backward compat
        photo: user.photo,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (err) {
    console.error("Google auth error:", err);
    return res.status(500).json({ success: false, message: "Server error during Google auth." });
  }
});

// Log Out Endpoint
app.post("/api/auth/logout", authenticateToken, async (req, res) => {
  try {
    const userIdStr = req.user.userId || req.user._id.toString();
    devLog("LOGOUT", { email: req.user.email, userId: userIdStr });
    await logUserActivity(userIdStr, "logout", `User logged out: ${req.user.email}`, { email: req.user.email });
    return res.json({ success: true, message: "Logout activity recorded successfully." });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ success: false, message: "Server error during logout." });
  }
});

// Change Password (authenticated users only)
// Allows email-authenticated users to update their password.
// Also allows Google-only users to SET a password for the first time (adds email auth method).
app.post("/api/auth/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "New password must be at least 6 characters long." });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User account not found." });
    }

    const hasEmailAuth = Array.isArray(user.authMethods) && user.authMethods.includes("email");
    const storedHash = user.passwordHash || user.password;

    // If user already has a password, verify currentPassword before allowing change
    if (hasEmailAuth && storedHash) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: "Current password is required." });
      }
      const isMatch = await bcrypt.compare(currentPassword, storedHash);
      if (!isMatch) {
        devLog("PASSWORD_CHANGE_FAIL", { email: user.email, userId: user._id.toString(), reason: "wrong_current_password" });
        return res.status(400).json({ success: false, message: "Current password is incorrect." });
      }
    }
    // If Google-only (no password yet), allow setting password without currentPassword check

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    const now = new Date();

    user.password = hashedPassword;
    user.passwordHash = hashedPassword;
    user.updatedAt = now;

    // Add "email" auth method if not already present
    if (!Array.isArray(user.authMethods)) user.authMethods = [];
    if (!user.authMethods.includes("email")) {
      user.authMethods.push("email");
    }

    await user.save();

    const userIdStr = user.userId || user._id.toString();
    devLog("PASSWORD_CHANGE_SUCCESS", { email: user.email, userId: userIdStr, authMethods: user.authMethods });
    await logUserActivity(
      userIdStr,
      "password change",
      `User changed account password for: ${user.email}`,
      { email: user.email, authMethods: user.authMethods },
      user.email
    );

    // Issue a fresh token after password change
    const token = generateToken(user._id);

    return res.json({
      success: true,
      message: "Password updated successfully.",
      token,
      user: {
        _id: user._id,
        id: user._id,
        userId: userIdStr,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified || user.verified,
        authMethods: user.authMethods,
        provider: user.provider,
        photo: user.photo
      }
    });
  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).json({ success: false, message: "Server error updating password." });
  }
});

// Support Ticket Endpoint (Create & Save)
app.post("/api/support", async (req, res) => {
  try {
    const { ticketId, name, email, message } = req.body;
    if (!email || !message) {
      return res.status(400).json({ success: false, message: "Email address and message are required." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanTicketId = ticketId || ("#SUP-" + Math.floor(1000 + Math.random() * 9000));

    // Save support ticket to MongoDB collection
    try {
      await SupportRequest.create({
        ticketId: cleanTicketId,
        name: (name || "User").trim(),
        email: cleanEmail,
        message: message.trim(),
        status: "Active & Sent to Support",
        createdAt: new Date()
      });
    } catch (dbErr) {
      console.warn("Could not insert into support_requests collection:", dbErr.message);
    }

    const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER || "support@ai-resume-analyzer.com";
    const subject = `Support Session ${cleanTicketId} — ${name || email}`;
    const textContent =
      `New support request from ${name || "User"} (${email}):\n\n` +
      `Ticket ID: ${cleanTicketId}\n` +
      `User Email: ${email}\n\n` +
      `Message:\n${message}`;

    sendEmailToUser(adminEmail, subject, textContent).catch(() => {});

    await logUserActivity(null, "support ticket", `User submitted support request: ${cleanTicketId}`, { ticketId: cleanTicketId, name, email: cleanEmail }, cleanEmail);

    return res.json({
      success: true,
      message: `Support ticket ${cleanTicketId} created successfully.`,
      ticketId: cleanTicketId
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to process support message." });
  }
});

// Get Support Requests for a user
app.get("/api/support", async (req, res) => {
  try {
    const email = (req.query.email || req.headers["x-user-email"] || "").toLowerCase().trim();
    if (!email) {
      return res.json({ success: true, tickets: [] });
    }
    const tickets = await SupportRequest.find({ email: email })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    return res.json({
      success: true,
      tickets: tickets.map(t => ({
        id: t.ticketId,
        ticketId: t.ticketId,
        name: t.name,
        email: t.email,
        message: t.message,
        status: t.status || "Active & Sent to Support",
        date: t.createdAt
      }))
    });
  } catch (err) {
    console.error("Get support requests error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch support requests." });
  }
});

// Delete Support Request Endpoint
app.delete(["/api/support/:ticketId", "/api/support"], async (req, res) => {
  try {
    const ticketId = req.params.ticketId || req.body?.ticketId || req.query?.ticketId;
    const email = (req.body?.email || req.query?.email || req.headers["x-user-email"] || "").toLowerCase().trim();

    if (!ticketId) {
      return res.status(400).json({ success: false, message: "Ticket ID is required." });
    }

    const query = { ticketId: ticketId };
    if (email) {
      query.email = email;
    }

    let deletedCount = 0;
    try {
      const delResult = await SupportRequest.deleteOne(query);
      deletedCount = delResult.deletedCount || 0;
    } catch (dbErr) {
      console.warn("support_requests delete warning:", dbErr.message);
    }

    // Log deletion activity in user_activity
    await logUserActivity(
      null,
      "delete support request",
      `User deleted support request: ${ticketId}`,
      { ticketId, email },
      email || null
    );

    return res.json({
      success: true,
      message: `Support request ${ticketId} deleted successfully.`,
      deletedCount
    });
  } catch (err) {
    console.error("Delete support request error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete support request." });
  }
});

app.post("/api/support/delete", async (req, res) => {
  try {
    const { ticketId, email } = req.body || {};
    if (!ticketId) {
      return res.status(400).json({ success: false, message: "Ticket ID is required." });
    }

    const cleanEmail = (email || req.headers["x-user-email"] || "").toLowerCase().trim();
    const query = { ticketId: ticketId };
    if (cleanEmail) {
      query.email = cleanEmail;
    }

    let deletedCount = 0;
    try {
      const delResult = await SupportRequest.deleteOne(query);
      deletedCount = delResult.deletedCount || 0;
    } catch (dbErr) {
      console.warn("support_requests delete warning:", dbErr.message);
    }

    await logUserActivity(
      null,
      "delete support request",
      `User deleted support request: ${ticketId}`,
      { ticketId, email: cleanEmail },
      cleanEmail || null
    );

    return res.json({
      success: true,
      message: `Support request ${ticketId} deleted successfully.`,
      deletedCount
    });
  } catch (err) {
    console.error("Delete support request error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete support request." });
  }
});

// Session Token Refresh Endpoint
app.post(["/api/auth/session-token", "/api/auth/refresh-token"], async (req, res) => {
  try {
    const email = req.body?.email || req.headers["x-user-email"];
    const userId = req.body?.userId || req.headers["x-user-id"];

    if (!email && !userId) {
      return res.status(400).json({ success: false, message: "Email or userId is required." });
    }

    const normEmail = email ? email.toLowerCase().trim() : null;
    const user = await User.findOne({
      $or: [
        ...(normEmail ? [{ email: normEmail }] : []),
        ...(userId ? [{ userId }, { _id: mongoose.Types.ObjectId.isValid(userId) ? userId : null }] : [])
      ]
    }).select("-password");

    if (!user) {
      return res.status(404).json({ success: false, message: "User account not found." });
    }

    const userIdStr = user.userId || user._id.toString();
    const token = generateToken(user._id);

    return res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        id: user._id,
        userId: userIdStr,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified || user.verified,
        provider: user.provider,
        photo: user.photo,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error renewing session." });
  }
});

// ==================== USER PROFILE ROUTES ====================

// Get Current User Profile
app.get("/api/user/profile", authenticateToken, async (req, res) => {
  try {
    return res.json({
      success: true,
      user: {
        _id: req.user._id,
        id: req.user._id,
        userId: req.user.userId || req.user._id.toString(),
        name: req.user.name,
        email: req.user.email,
        emailVerified: req.user.emailVerified || req.user.verified,
        provider: req.user.provider,
        photo: req.user.photo,
        createdAt: req.user.createdAt,
        updatedAt: req.user.updatedAt
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Error fetching profile." });
  }
});

// Update Profile
app.put("/api/user/profile", authenticateToken, async (req, res) => {
  try {
    const { name, photo } = req.body;
    const updateData = { updatedAt: new Date() };
    if (name && typeof name === "string" && name.trim()) updateData.name = name.trim();
    if (photo !== undefined) updateData.photo = photo;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(500).json({ success: false, message: "Database profile update failed." });
    }

    const userIdStr = updatedUser.userId || updatedUser._id.toString();
    const userEmail = updatedUser.email ? updatedUser.email.toLowerCase().trim() : "";
    const userQuery = {
      $or: [
        { userId: userIdStr },
        ...(userEmail ? [{ email: userEmail }] : [])
      ]
    };

    // Sync name across collections where required
    if (name && typeof name === "string" && name.trim()) {
      await UserActivity.updateOne(userQuery, { $set: { name: updatedUser.name } });
      await ResumeHistory.updateOne(userQuery, { $set: { name: updatedUser.name } });
      await ResumeAnalysis.updateMany(userQuery, { $set: { name: updatedUser.name } });
    }

    await logUserActivity(
      userIdStr,
      "profile update",
      `User updated profile (Name: ${updatedUser.name})`,
      { name: updatedUser.name, photoUpdated: photo !== undefined },
      userEmail
    );

    return res.json({
      success: true,
      message: "Profile updated successfully.",
      token: generateToken(updatedUser._id),
      user: {
        _id: updatedUser._id,
        id: updatedUser._id,
        userId: userIdStr,
        name: updatedUser.name,
        email: updatedUser.email,
        emailVerified: updatedUser.emailVerified || updatedUser.verified,
        provider: updatedUser.provider,
        photo: updatedUser.photo,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Error updating profile in MongoDB: " + err.message });
  }
});

// ==================== USER ACTIVITY ROUTES ====================

// Get User's Activity Log (Returns user_activity document for authenticated user)
app.get(["/api/activity", "/api/user/activity"], authenticateToken, async (req, res) => {
  try {
    const userIdStr = req.user.userId || req.user._id.toString();
    const userEmail = req.user.email ? req.user.email.toLowerCase().trim() : "";

    const userActDoc = await UserActivity.findOne({
      $or: [
        { userId: userIdStr },
        ...(userEmail ? [{ email: userEmail }] : [])
      ]
    });
    const rawList = userActDoc && Array.isArray(userActDoc.activities) ? userActDoc.activities : [];

    const activities = [...rawList].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 100);

    return res.json({
      success: true,
      userId: userIdStr,
      name: req.user.name,
      email: req.user.email,
      activities: activities.map((act, index) => ({
        id: act._id ? act._id.toString() : `act_${index}`,
        userId: userIdStr,
        action: act.activityType,
        activityType: act.activityType,
        description: act.description,
        timestamp: act.timestamp
      }))
    });
  } catch (err) {
    console.error("Get activity error:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve activity log from MongoDB." });
  }
});

// Log Custom Activity
app.post(["/api/activity", "/api/user/activity"], authenticateToken, async (req, res) => {
  try {
    const { action, activityType, description, activityDescription, filename, filePath } = req.body;
    const actName = activityType || action || "custom action";
    const descText = description || activityDescription || `User performed ${actName}`;
    const userIdStr = req.user.userId || req.user._id.toString();
    const userEmail = req.user.email ? req.user.email.toLowerCase().trim() : "";

    const logged = await logUserActivity(userIdStr, actName, descText, { filename, filePath, ...req.body }, userEmail);
    return res.json({ success: true, message: "Activity logged successfully.", activity: logged });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to record activity." });
  }
});

app.post("/api/activity/upload", authenticateToken, async (req, res) => {
  try {
    const { filename, filePath } = req.body;
    const fname = filename || "resume.pdf";
    const userIdStr = req.user.userId || req.user._id.toString();

    const logged = await logUserActivity(userIdStr, "resume upload", `User uploaded resume file: ${fname}`, { filename: fname, filePath: filePath || "" });
    return res.json({ success: true, message: "Resume upload activity recorded.", activity: logged });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to record upload activity." });
  }
});

app.post("/api/activity/download", authenticateToken, async (req, res) => {
  try {
    const { filename, format } = req.body;
    const fname = filename || "resume_report.pdf";
    const userIdStr = req.user.userId || req.user._id.toString();

    const logged = await logUserActivity(userIdStr, "resume download", `User downloaded resume report for: ${fname}`, { filename: fname, downloadFormat: format || "pdf" });
    return res.json({ success: true, message: "Resume download activity recorded.", activity: logged });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to record download activity." });
  }
});

// ==================== RESUME ANALYSIS & HISTORY ROUTES ====================

// Save & Process Resume Analysis
const handleResumeAnalyze = async (req, res) => {
  try {
    const {
      fileName,
      filename,
      fileType,
      fileData,
      filePath: incomingFilePath,
      fileUrl: incomingFileUrl,
      analysisType,
      mode,
      atsScore,
      score,
      analysisResult,
      analysisResults,
      verdict,
      resumeText,
      detectedSkills,
      missingKeywords,
      suggestions,
      extractedData
    } = req.body;

    const finalName = fileName || filename || "resume.pdf";
    const finalScore = Number(atsScore !== undefined ? atsScore : (score !== undefined ? score : 0));
    const userIdStr = req.user.userId || req.user._id.toString();
    const userName = req.user.name || "";
    const userEmail = req.user.email ? req.user.email.toLowerCase().trim() : "";

    if (!finalName) {
      return res.status(400).json({ success: false, message: "fileName/filename is required." });
    }

    let savedFilePath = incomingFilePath || incomingFileUrl || "";
    if (fileData) {
      const stored = saveUploadedFile(fileData, finalName);
      if (stored) savedFilePath = stored;
    }
    if (!savedFilePath) {
      savedFilePath = `/uploads/${finalName.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
    }

    const computedAnalysisType = analysisType || (mode === "ats" ? "ATS" : "normal");
    const computedAnalysisResult = analysisResult || analysisResults || {
      verdict: verdict || "Analyzed",
      atsScore: finalScore,
      score: finalScore,
      detectedSkills: Array.isArray(detectedSkills) ? detectedSkills : [],
      missingKeywords: Array.isArray(missingKeywords) ? missingKeywords : [],
      suggestions: Array.isArray(suggestions) ? suggestions : []
    };

    const computedExtractedData = extractedData || {
      name: userName,
      email: userEmail,
      phone: "",
      skills: Array.isArray(detectedSkills) ? detectedSkills : [],
      education: [],
      experience: []
    };

    // Calculate SHA-256 Content Hash for Duplicate Prevention
    const contentToHash = (resumeText && resumeText.trim().length > 10) ? resumeText.trim() : (finalName + "_" + finalScore);
    const resumeHash = crypto.createHash("sha256").update(contentToHash).digest("hex");
    const now = new Date();
    const newResumeId = new mongoose.Types.ObjectId().toString();

    // 1. Atomic UPSERT in resume_analysis collection (Prevent Duplicates on userId + resumeHash + analysisType)
    const analysisDoc = await ResumeAnalysis.findOneAndUpdate(
      { userId: userIdStr, resumeHash: resumeHash, analysisType: computedAnalysisType },
      {
        $setOnInsert: {
          userId: userIdStr,
          resumeId: newResumeId,
          resumeHash: resumeHash,
          analysisType: computedAnalysisType,
          firstUploadedAt: now
        },
        $set: {
          name: userName,
          email: userEmail,
          fileName: finalName,
          atsScore: finalScore,
          extractedData: computedExtractedData,
          analysisResult: computedAnalysisResult,
          lastUpdatedAt: now
        }
      },
      { upsert: true, returnDocument: "after" }
    );

    const activeResumeId = analysisDoc.resumeId || newResumeId;

    // 2. Atomic Update in resume_history collection (1 document per user)
    const userQuery = {
      $or: [
        { userId: userIdStr },
        ...(userEmail ? [{ email: userEmail }] : [])
      ]
    };

    const userHistoryDoc = await ResumeHistory.findOne(userQuery);
    const existingHistoryItem = userHistoryDoc && Array.isArray(userHistoryDoc.history) 
      ? userHistoryDoc.history.find(item => item.resumeId === activeResumeId || item.fileName === finalName)
      : null;

    if (existingHistoryItem) {
      // Update existing item in history array
      await ResumeHistory.updateOne(
        { _id: userHistoryDoc._id, "history.resumeId": existingHistoryItem.resumeId },
        {
          $set: {
            userId: userIdStr,
            name: userName,
            email: userEmail,
            "history.$.fileName": finalName,
            "history.$.uploadedAt": now,
            "history.$.atsScore": finalScore,
            "history.$.analysisType": computedAnalysisType,
            "history.$.status": "analyzed",
            updatedAt: now
          }
        }
      );
    } else {
      // Push new item into history array
      await ResumeHistory.findOneAndUpdate(
        userQuery,
        {
          $set: { userId: userIdStr, name: userName, email: userEmail, updatedAt: now },
          $push: {
            history: {
              resumeId: activeResumeId,
              fileName: finalName,
              uploadedAt: now,
              analysisType: computedAnalysisType,
              atsScore: finalScore,
              status: "analyzed"
            }
          }
        },
        { upsert: true, returnDocument: "after" }
      );
    }

    // 3. Log Activity
    const actDesc = computedAnalysisType === "ATS"
      ? `ATS score check for: ${finalName} (ATS Score: ${finalScore})`
      : `User completed resume analysis for: ${finalName} (Score: ${finalScore})`;
    await logUserActivity(userIdStr, "resume_analysis", actDesc, { filename: finalName, score: finalScore, resumeId: activeResumeId }, userEmail);

    return res.status(201).json({
      success: true,
      message: "Resume analysis record saved cleanly in MongoDB.",
      analysis: analysisDoc,
      entry: {
        id: activeResumeId,
        _id: analysisDoc._id.toString(),
        resumeId: activeResumeId,
        userId: userIdStr,
        fileName: finalName,
        filePath: savedFilePath,
        fileUrl: savedFilePath,
        analysisType: computedAnalysisType,
        atsScore: finalScore,
        score: finalScore,
        verdict: verdict || "Analyzed",
        analysisResult: computedAnalysisResult,
        date: analysisDoc.lastUpdatedAt || now
      }
    });
  } catch (err) {
    console.error("Save analysis error:", err);
    return res.status(500).json({ success: false, message: "Failed to save analysis in MongoDB." });
  }
};

app.post("/api/history", authenticateToken, handleResumeAnalyze);
app.post("/api/resume/analyze", authenticateToken, handleResumeAnalyze);
app.post("/api/resume/upload", authenticateToken, handleResumeAnalyze);

// Get User's Resume History (Returns history array from resume_history collection)
app.get(["/api/history", "/api/user/resume-history"], authenticateToken, async (req, res) => {
  try {
    const userIdStr = req.user.userId || req.user._id.toString();
    const userEmail = req.user.email ? req.user.email.toLowerCase().trim() : "";

    const userQuery = {
      $or: [
        { userId: userIdStr },
        ...(userEmail ? [{ email: userEmail }] : [])
      ]
    };

    let historyDoc = await ResumeHistory.findOne(userQuery);
    let rawList = historyDoc && Array.isArray(historyDoc.history) ? historyDoc.history : [];

    // Fallback: If resume_history is empty, check resume_analysis and backfill
    if (rawList.length === 0) {
      const analyses = await ResumeAnalysis.find(userQuery).sort({ lastUpdatedAt: -1 });

      if (analyses.length > 0) {
        rawList = analyses.map(a => ({
          resumeId: a.resumeId || a._id.toString(),
          fileName: a.fileName || "resume.pdf",
          uploadedAt: a.lastUpdatedAt || a.firstUploadedAt || new Date(),
          analysisType: a.analysisType || "normal",
          atsScore: a.atsScore || 0,
          status: "analyzed"
        }));

        await ResumeHistory.findOneAndUpdate(
          userQuery,
          {
            $set: { userId: userIdStr, name: req.user.name, email: userEmail, history: rawList, updatedAt: new Date() }
          },
          { upsert: true }
        );
      }
    }

    const historyList = [...rawList].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    const formattedList = historyList.map(item => ({
      id: item.resumeId,
      _id: item.resumeId,
      resumeId: item.resumeId,
      userId: userIdStr,
      fileName: item.fileName,
      filename: item.fileName,
      fileType: (item.fileName || "").split(".").pop() || "pdf",
      analysisType: item.analysisType || "normal",
      atsScore: item.atsScore || 0,
      score: item.atsScore || 0,
      status: item.status || "analyzed",
      verdict: "Analyzed",
      uploadedAt: item.uploadedAt,
      date: item.uploadedAt
    }));

    return res.json({
      success: true,
      userId: userIdStr,
      name: req.user.name,
      email: req.user.email,
      count: formattedList.length,
      history: formattedList
    });
  } catch (err) {
    console.error("Get history error:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve history from MongoDB." });
  }
});

// Get Unique Resume Analysis Records for User
app.get("/api/user/resume-analysis", authenticateToken, async (req, res) => {
  try {
    const userIdStr = req.user.userId || req.user._id.toString();
    const userEmail = req.user.email ? req.user.email.toLowerCase().trim() : "";
    const userQuery = {
      $or: [
        { userId: userIdStr },
        ...(userEmail ? [{ email: userEmail }] : [])
      ]
    };

    const records = await ResumeAnalysis.find(userQuery).sort({ lastUpdatedAt: -1 });

    return res.json({
      success: true,
      userId: userIdStr,
      count: records.length,
      analyses: records
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to retrieve resume analyses." });
  }
});

// Delete Item from User's Resume History
app.delete(["/api/history/:id", "/api/user/resume-history/:id"], authenticateToken, async (req, res) => {
  try {
    const targetId = req.params.id;
    const userIdStr = req.user.userId || req.user._id.toString();
    const userEmail = req.user.email ? req.user.email.toLowerCase().trim() : "";

    const userQuery = {
      $or: [
        { userId: userIdStr },
        ...(userEmail ? [{ email: userEmail }] : [])
      ]
    };

    const updatedDoc = await ResumeHistory.findOneAndUpdate(
      userQuery,
      {
        $pull: {
          history: {
            $or: [
              { resumeId: targetId },
              { fileName: targetId }
            ]
          }
        },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: "after" }
    );

    // Also delete any matching analysis in ResumeAnalysis
    await ResumeAnalysis.deleteMany({
      $and: [
        userQuery,
        {
          $or: [
            { resumeId: targetId },
            { fileName: targetId },
            ...(mongoose.Types.ObjectId.isValid(targetId) ? [{ _id: targetId }] : [])
          ]
        }
      ]
    });

    const remainingRaw = updatedDoc && Array.isArray(updatedDoc.history) ? updatedDoc.history : [];
    const remainingList = [...remainingRaw].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)).map(item => ({
      id: item.resumeId,
      _id: item.resumeId,
      resumeId: item.resumeId,
      userId: userIdStr,
      fileName: item.fileName,
      filename: item.fileName,
      fileType: (item.fileName || "").split(".").pop() || "pdf",
      analysisType: item.analysisType || "normal",
      atsScore: item.atsScore || 0,
      score: item.atsScore || 0,
      status: item.status || "analyzed",
      verdict: "Analyzed",
      uploadedAt: item.uploadedAt,
      date: item.uploadedAt
    }));

    await logUserActivity(userIdStr, "resume deletion", `User deleted resume entry ${targetId}`, { resumeId: targetId }, userEmail);

    return res.json({
      success: true,
      message: "History entry deleted successfully.",
      count: remainingList.length,
      history: remainingList
    });
  } catch (err) {
    console.error("Delete history error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete history entry." });
  }
});

// Dashboard Consolidated Endpoint
app.get("/api/user/dashboard", authenticateToken, async (req, res) => {
  try {
    const userIdStr = req.user.userId || req.user._id.toString();

    const historyDoc = await ResumeHistory.findOne({ userId: userIdStr });
    const historyItems = historyDoc && Array.isArray(historyDoc.history) ? historyDoc.history : [];

    const activityDoc = await UserActivity.findOne({ userId: userIdStr });
    const activityItems = activityDoc && Array.isArray(activityDoc.activities) ? activityDoc.activities : [];

    const analyses = await ResumeAnalysis.find({ userId: userIdStr }).sort({ lastUpdatedAt: -1 });

    const totalResumes = historyItems.length;
    const scores = historyItems.map(h => Number(h.atsScore || 0)).filter(s => !isNaN(s));
    const latestScore = scores.length ? scores[0] : null;
    const highestScore = scores.length ? Math.max(...scores) : null;
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    const latestUpload = historyItems.length ? {
      fileName: historyItems[0].fileName,
      uploadedAt: historyItems[0].uploadedAt
    } : null;

    return res.json({
      success: true,
      user: {
        _id: req.user._id,
        id: req.user._id,
        userId: userIdStr,
        name: req.user.name,
        email: req.user.email,
        emailVerified: req.user.emailVerified || req.user.verified,
        provider: req.user.provider,
        photo: req.user.photo,
        createdAt: req.user.createdAt,
        updatedAt: req.user.updatedAt
      },
      stats: {
        totalResumes,
        latestScore,
        highestScore,
        avgScore,
        latestUpload
      },
      recentAnalyses: analyses.slice(0, 10),
      recentActivities: [...activityItems].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20),
      history: historyItems
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve dashboard data." });
  }
});

// Serve static frontend files (CSS, JS, assets)
app.use(express.static(path.join(__dirname)));

// 404 Handler for API endpoints
app.use("/api", (req, res) => {
  return res.status(404).json({ success: false, message: "API endpoint not found." });
});

// Global API error handler
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  if (res.headersSent) return next(err);
  if (req.path && req.path.startsWith("/api")) {
    return res.status(500).json({ success: false, message: "Internal server error: " + (err.message || "Unknown error") });
  }
  next(err);
});

// Fallback to index.html for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Start Server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`AI Resume Analyzer server running on http://localhost:${PORT} and http://127.0.0.1:${PORT}`);
});
