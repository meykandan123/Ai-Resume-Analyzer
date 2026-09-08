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
require("dotenv").config();

const User = require("./models/User");
const UserActivity = require("./models/UserActivity");
const ResumeHistory = require("./models/ResumeHistory");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/Ai-Resume-Analyzer";
const JWT_SECRET = process.env.JWT_SECRET || "ai_resume_secret_key_987654321";

// Ensure uploads folder exists and serve statically
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (e) {}
}

// Middleware
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Handle JSON body parser syntax errors with application/json content-type
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

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      dbName: "Ai-Resume-Analyzer",
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000
    });
    console.log("Connected to MongoDB database (Ai-Resume-Analyzer) successfully:", MONGODB_URI.replace(/:([^@]+)@/, ":*****@"));

    // Automatically ensure collections exist in MongoDB database: users, user_activity, resume_history
    try {
      await User.createCollection();
      await UserActivity.createCollection();
      await ResumeHistory.createCollection();

      console.log("Collections verified/created in Ai-Resume-Analyzer: users, user_activity, resume_history");
    } catch (collErr) {
      console.log("Collection initialization notice:", collErr.message);
    }
  } catch (err) {
    console.warn("Could not connect to configured MONGODB_URI (" + MONGODB_URI + ").");
    if (MongoMemoryServer) {
      try {
        console.log("Starting in-memory MongoDB server as fallback...");
        const mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        await mongoose.connect(uri, { dbName: "Ai-Resume-Analyzer" });
        console.log("Connected to In-Memory MongoDB database successfully:", uri);
        await User.createCollection();
        await UserActivity.createCollection();
        await ResumeHistory.createCollection();
        return;
      } catch (memErr) {
        console.error("MongoMemoryServer error:", memErr.message);
      }
    }
    console.error("MongoDB server not available. Ensure local mongod is running or update MONGODB_URI in .env");
  }
}
connectDB();

// Helper to log activities automatically into "User Activity" collection
async function logUserActivity(userOrId, activityType, description, metadata = {}, userEmail = null) {
  try {
    // STRICT RULE: Do NOT save activities for anonymous / unauthenticated users
    if (!userOrId && !userEmail) return null;

    let targetUserId = null;
    let emailToSave = userEmail ? userEmail.toLowerCase().trim() : null;

    if (userOrId instanceof mongoose.Types.ObjectId || typeof userOrId === "string") {
      targetUserId = userOrId.toString();
    } else if (userOrId && userOrId._id) {
      targetUserId = userOrId.userId || userOrId._id.toString();
      if (!emailToSave && userOrId.email) {
        emailToSave = userOrId.email.toLowerCase().trim();
      }
    }

    if (!targetUserId) return null;

    if (mongoose.Types.ObjectId.isValid(targetUserId)) {
      const u = await User.findById(targetUserId).select("email userId");
      if (u) {
        if (u.userId) targetUserId = u.userId;
        if (!emailToSave && u.email) emailToSave = u.email.toLowerCase().trim();
      }
    }

    if (!targetUserId) return null;

    const actType = activityType || "general";
    const descText = description || `${actType} activity recorded`;
    const now = new Date();

    const activity = new UserActivity({
      userId: targetUserId,
      email: emailToSave,
      userEmail: emailToSave,
      activityType: actType,
      action: actType,
      description: descText,
      activityDescription: descText,
      metadata: metadata || {},
      timestamp: now
    });

    await activity.save();

    // Verify that the MongoDB insert operation actually succeeds
    const verifiedActivity = await UserActivity.findById(activity._id);
    if (!verifiedActivity) {
      console.error(`MongoDB activity insert verification failed for [${actType}]`);
      return null;
    }

    return verifiedActivity;
  } catch (err) {
    console.error(`Failed to log activity [${activityType}]:`, err.message);
    return null;
  }
}

// Authentication Middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ success: false, message: "Access denied. Token missing." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User account not found." });
    }
    if (!user.userId) {
      user.userId = user._id.toString();
      await user.save();
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: "Invalid or expired token." });
  }
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

// Express route for email verification URL
app.get("/verify-email", (req, res) => {
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

// Helper: Hash Verification Token with SHA-256 (Never store plain tokens in DB)
const hashToken = (token) => {
  if (!token || typeof token !== "string") return "";
  return crypto.createHash("sha256").update(token).digest("hex");
};

// Helper: Send email directly using Backend Email Service (SMTP)
const sendEmailToUser = async (toEmail, subject, textMessage, htmlMessage) => {
  if (!toEmail || typeof toEmail !== "string") return false;
  const normalized = toEmail.toLowerCase().trim();

  const host = process.env.EMAIL_HOST || process.env.SMTP_HOST;
  const port = parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT || "587");
  const user = process.env.EMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS || process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM || process.env.SMTP_FROM || `"AI Resume Analyzer" <${user || "no-reply@ai-resume-analyzer.com"}>`;

  // Send via Nodemailer SMTP if credentials are configured in environment
  if (nodemailer && host && user && pass) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: process.env.EMAIL_SECURE === "true" || process.env.SMTP_SECURE === "true" || port === 465,
        auth: { user, pass }
      });
      await transporter.sendMail({
        from,
        to: normalized,
        subject: subject,
        text: textMessage,
        html: htmlMessage || `<div style="font-family:sans-serif; padding:20px;">${textMessage.replace(/\n/g, "<br/>")}</div>`
      });
      console.log(`[Backend Email Service] Delivered '${subject}' directly to ${normalized}`);
      return true;
    } catch (smtpErr) {
      console.error("[Backend Email Service] SMTP delivery error:", smtpErr.message);
      return false;
    }
  }

  // Simulated backend send for local dev / unconfigured SMTP environment
  console.log(`[Backend Email Service - Dev Log] Subject: '${subject}' | To: ${normalized}`);
  return true;
};

// ==================== AUTH ROUTES ====================

// Sign Up
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email, and password are required." });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Do not create duplicate users with the same email
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "An account with this email already exists." });
    }

    // Hash password using bcrypt - NEVER store plain text
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const rawVerifyToken = generateVerifyToken();
    const hashedVerifyToken = hashToken(rawVerifyToken);
    const verifyTokenExpires = new Date(Date.now() + 5 * 60 * 1000); // Exactly 5 minutes
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
      provider: "email",
      emailVerified: false,
      verified: false,
      verifyToken: hashedVerifyToken,
      verifyTokenExpires,
      createdAt: now,
      updatedAt: now
    });

    // Save to existing MongoDB database
    await newUser.save();

    // Verify that the MongoDB insert operation actually succeeds
    const verifiedUser = await User.findById(newUser._id);
    if (!verifiedUser) {
      console.error("MongoDB insert verification failed for userId:", userId);
      return res.status(500).json({ success: false, message: "Failed to save user into MongoDB database. Insert verification failed." });
    }

    // Automatically record user signup activity
    await logUserActivity(newUser._id, "user signup", `User registered with email: ${normalizedEmail}`, { email: normalizedEmail, provider: "email" });

    const host = req.get("host") || "localhost:5000";
    const protocol = req.protocol || "http";
    const appUrl = (process.env.APP_URL || process.env.BASE_URL || `${protocol}://${host}`).replace(/\/+$/, "");
    const verifyLink = `${appUrl}/verify-email?token=${rawVerifyToken}&email=${encodeURIComponent(newUser.email)}`;

    const textMessage =
      `Hi ${newUser.name || "there"},\n\n` +
      `Thank you for creating an account with AI Resume Analyzer!\n` +
      `Please verify your email address to complete your registration by clicking the link below:\n\n` +
      `${verifyLink}\n\n` +
      `⏰ IMPORTANT: This verification link is valid for 5 minutes.\n\n` +
      `If you didn't create this account, you can safely ignore this email.`;

    const htmlMessage =
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">` +
      `<h2 style="color: #4f46e5; text-align: center;">Verify Your Account</h2>` +
      `<p>Hi <strong>${newUser.name || "there"}</strong>,</p>` +
      `<p>Thank you for signing up for AI Resume Analyzer! Please verify your email address to complete your registration and activate your account.</p>` +
      `<div style="text-align: center; margin: 30px 0;">` +
      `<a href="${verifyLink}" style="background-color: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Verify My Account</a>` +
      `</div>` +
      `<p style="font-size: 13px; color: #666;">Or copy and paste this link into your browser:<br/><a href="${verifyLink}">${verifyLink}</a></p>` +
      `<p style="font-size: 13px; color: #d97706; font-weight: bold;">⏰ IMPORTANT: This verification link is valid for exactly 5 minutes.</p>` +
      `<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />` +
      `<p style="font-size: 12px; color: #888;">If you didn't create an account, please ignore this email.</p>` +
      `</div>`;

    sendEmailToUser(newUser.email, "Verify Your Account", textMessage, htmlMessage).catch(() => {});

    return res.status(201).json({
      success: true,
      requireVerification: true,
      message: "Account created successfully! A verification link has been sent to your email. Please check your Inbox or Spam/Junk folder.",
      email: newUser.email,
      name: newUser.name,
      verifyToken: rawVerifyToken,
      user: {
        _id: newUser._id,
        userId: newUser.userId,
        name: newUser.name,
        email: newUser.email,
        emailVerified: false,
        updatedAt: newUser.updatedAt
      }
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: "An account with this email already exists." });
    }
    console.error("Signup error:", err);
    return res.status(500).json({ success: false, message: "Server error during registration." });
  }
});

// Email Verification Endpoint (Supports both POST & GET)
const verifyEmailHandler = async (req, res) => {
  try {
    const email = req.body?.email || req.query?.email || req.body?.verifyEmail || req.query?.verifyEmail;
    const token = req.body?.token || req.query?.token || req.body?.verifyToken || req.query?.verifyToken;

    if (!token) {
      return res.status(400).json({ success: false, message: "Verification token is required." });
    }

    const hashedIncomingToken = hashToken(token);
    const normalizedEmail = email ? email.toLowerCase().trim() : null;

    // Search user by hashed token OR by raw token (for backward compatibility) OR by email
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

    // Check if already verified
    if (user.verified || user.emailVerified) {
      if (!user.verifyToken || (user.verifyToken !== hashedIncomingToken && user.verifyToken !== token)) {
        return res.json({
          success: true,
          verified: true,
          message: "Email verified successfully! Your account is now verified. You can log in.",
          user: { _id: user._id, userId: userIdStr, name: user.name, email: user.email, emailVerified: true }
        });
      }
    }

    // Check token match
    const tokenMatches = user.verifyToken && (user.verifyToken === hashedIncomingToken || user.verifyToken === token);
    if (!tokenMatches) {
      return res.status(400).json({ success: false, message: "Verification link is invalid or has already been used." });
    }

    // Check expiration (exactly 5 minutes limit)
    if (!user.verifyTokenExpires || user.verifyTokenExpires < new Date()) {
      return res.status(400).json({
        success: false,
        isExpired: true,
        message: "Verification link expired. Please request a new verification link."
      });
    }

    // Mark user as verified and invalidate token (single-use)
    const now = new Date();
    user.emailVerified = true;
    user.verified = true;
    user.verifyToken = null;
    user.verifyTokenExpires = null;
    user.updatedAt = now;
    await user.save();

    // Log activities
    await logUserActivity(user._id, "email verification", `User verified email address: ${user.email}`, { email: user.email });

    const jwtToken = generateToken(user._id);

    return res.json({
      success: true,
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

app.post("/api/auth/verify", verifyEmailHandler);
app.get("/api/auth/verify", verifyEmailHandler);

// Resend Verification Email Token
app.post("/api/auth/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required." });

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user || user.provider !== "email") {
      return res.status(404).json({ success: false, message: "Account not found." });
    }

    if (user.verified || user.emailVerified) {
      return res.json({ success: true, message: "Email is already verified. Please log in normally." });
    }

    const rawVerifyToken = generateVerifyToken();
    const hashedVerifyToken = hashToken(rawVerifyToken);
    user.verifyToken = hashedVerifyToken;
    user.verifyTokenExpires = new Date(Date.now() + 5 * 60 * 1000); // Fresh 5 minutes
    await user.save();

    const host = req.get("host") || "localhost:5000";
    const protocol = req.protocol || "http";
    const appUrl = (process.env.APP_URL || process.env.BASE_URL || `${protocol}://${host}`).replace(/\/+$/, "");
    const verifyLink = `${appUrl}/verify-email?token=${rawVerifyToken}&email=${encodeURIComponent(user.email)}`;

    const textMessage =
      `Hi ${user.name || "there"},\n\n` +
      `Please verify your email address to complete your registration by clicking the link below:\n\n` +
      `${verifyLink}\n\n` +
      `⏰ IMPORTANT: This verification link is valid for 5 minutes.\n\n` +
      `If you didn't request this email, you can safely ignore it.`;

    const htmlMessage =
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">` +
      `<h2 style="color: #4f46e5; text-align: center;">Verify Your Account</h2>` +
      `<p>Hi <strong>${user.name || "there"}</strong>,</p>` +
      `<p>Here is your new verification link. Please verify your email address to activate your account.</p>` +
      `<div style="text-align: center; margin: 30px 0;">` +
      `<a href="${verifyLink}" style="background-color: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Verify My Account</a>` +
      `</div>` +
      `<p style="font-size: 13px; color: #666;">Or copy and paste this link into your browser:<br/><a href="${verifyLink}">${verifyLink}</a></p>` +
      `<p style="font-size: 13px; color: #d97706; font-weight: bold;">⏰ IMPORTANT: This verification link is valid for exactly 5 minutes.</p>` +
      `<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />` +
      `<p style="font-size: 12px; color: #888;">If you didn't request a new link, please ignore this email.</p>` +
      `</div>`;

    sendEmailToUser(user.email, "Verify Your Account", textMessage, htmlMessage).catch(() => {});

    return res.json({
      success: true,
      message: "Account created successfully! A verification link has been sent to your email. Please check your Inbox or Spam/Junk folder.",
      email: user.email,
      name: user.name,
      verifyToken: rawVerifyToken
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error resending verification." });
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

    // Find user using email or userId
    const user = await User.findOne({
      $or: [
        { email: normalizedIdentifier },
        { userId: identifier },
        { _id: mongoose.Types.ObjectId.isValid(identifier) ? identifier : null }
      ]
    });

    if (!user || user.provider !== "email") {
      return res.status(400).json({ success: false, message: "Incorrect email/userId or password." });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash || user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Incorrect email/userId or password." });
    }

    // Check verification status
    if (!user.verified && !user.emailVerified) {
      return res.status(401).json({
        success: false,
        requireVerification: true,
        message: "Please verify your email before logging in. We have sent a verification link to your email.",
        email: user.email
      });
    }

    const now = new Date();

    user.updatedAt = now;
    if (!user.userId) user.userId = user._id.toString();
    if (!user.passwordHash && user.password) user.passwordHash = user.password;

    await user.save();

    const updatedUser = await User.findById(user._id);
    if (!updatedUser) {
      console.error("MongoDB user lookup verification failed for userId:", user._id.toString());
      return res.status(500).json({ success: false, message: "Database user verification failed during login." });
    }

    const userIdStr = updatedUser.userId || updatedUser._id.toString();

    // Record login activity
    await logUserActivity(updatedUser._id, "login", `User logged in with email: ${updatedUser.email}`, { email: updatedUser.email, provider: updatedUser.provider });

    const token = generateToken(updatedUser._id);

    return res.json({
      success: true,
      message: "Login successful.",
      token,
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
    console.error("Login error:", err);
    return res.status(500).json({ success: false, message: "Server error during login." });
  }
});

// Forgot Password Endpoint
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email address is required." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // For security, do not disclose if email exists or provider type to unauthenticated clients
    if (!user || user.provider !== "email") {
      return res.json({
        success: true,
        message: `If an account exists for ${normalizedEmail}, a password reset link has been sent to that inbox (or spam folder).`
      });
    }

    // Generate single-use reset token valid for 15 minutes
    const resetToken = generateVerifyToken();
    user.resetToken = resetToken;
    user.resetTokenExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    const host = req.get("host") || "localhost:5000";
    const protocol = req.protocol || "http";
    const resetLink = `${protocol}://${host}/?resetEmail=${encodeURIComponent(user.email)}&resetToken=${resetToken}`;
    const resetMessage =
      `Hi ${user.name || "there"},\n\n` +
      `Click the link below to reset your password for AI Resume Analyzer:\n\n` +
      `${resetLink}\n\n` +
      `⏰ IMPORTANT: This password reset link is valid for 15 minutes.\n\n` +
      `If you didn't request a password reset, you can safely ignore this email.`;

    // Send email directly to THAT USER's registered email address
    await sendEmailToUser(user.email, "Reset your password — AI Resume Analyzer", resetMessage);

    return res.json({
      success: true,
      message: `Password reset link sent to ${user.email}! Please check your inbox and spam folder (valid for 15 minutes).`,
      email: user.email
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ success: false, message: "Server error processing password reset." });
  }
});

// Reset Password Endpoint
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      return res.status(400).json({ success: false, message: "Email, reset token, and new password are required." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user || user.provider !== "email") {
      return res.status(404).json({ success: false, message: "Account not found." });
    }

    if (!user.resetToken || user.resetToken !== token || !user.resetTokenExpires || user.resetTokenExpires < new Date()) {
      return res.status(400).json({ success: false, message: "Password reset link is invalid or has expired. Please request a new one." });
    }

    // Hash new password using bcrypt - NEVER store plain text
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    user.password = hashedPassword;
    user.passwordHash = hashedPassword;
    user.updatedAt = new Date();
    user.resetToken = null;
    user.resetTokenExpires = null;
    await user.save();

    const userIdStr = user.userId || user._id.toString();
    await logUserActivity(userIdStr, "password reset", `User reset password for email: ${user.email}`, { email: user.email });

    return res.json({
      success: true,
      message: "Password reset successfully! Please log in with your new password."
    });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ success: false, message: "Server error resetting password." });
  }
});

// Support Ticket & Notification Endpoint
app.post("/api/support", async (req, res) => {
  try {
    const { ticketId, name, email, message } = req.body;
    if (!email || !message) {
      return res.status(400).json({ success: false, message: "Email address and message are required." });
    }

    const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER || "support@ai-resume-analyzer.com";
    const subject = `Support Session ${ticketId || ""} — ${name || email}`;
    const textContent =
      `New support request from ${name || "User"} (${email}):\n\n` +
      `Ticket ID: ${ticketId || "N/A"}\n` +
      `User Email: ${email}\n\n` +
      `Message:\n${message}`;

    sendEmailToUser(adminEmail, subject, textContent).catch(() => {});

    return res.json({
      success: true,
      message: `Support ticket ${ticketId || ""} created successfully.`
    });
  } catch (err) {
    console.error("Support API error:", err);
    return res.status(500).json({ success: false, message: "Failed to process support message." });
  }
});

// Google Auth Sync & Server-side Token Verification Fallback
app.post("/api/auth/google", async (req, res) => {
  try {
    let { name, email, access_token, id_token } = req.body;

    // Server-to-server fallback if email is not passed directly but access_token or id_token is provided
    if (!email && access_token) {
      try {
        const googleRes = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${encodeURIComponent(access_token)}`);
        if (googleRes.ok) {
          const gProfile = await googleRes.json();
          email = gProfile.email;
          name = name || gProfile.name;
        }
      } catch (e) {
        console.warn("Backend Google userinfo fetch error:", e);
      }
    }

    if (!email && (access_token || id_token)) {
      try {
        const tokenInfoUrl = id_token 
          ? `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`
          : `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(access_token)}`;
        const gRes = await fetch(tokenInfoUrl);
        if (gRes.ok) {
          const gInfo = await gRes.json();
          email = gInfo.email;
          name = name || gInfo.name || (email ? email.split("@")[0] : "");
        }
      } catch (e) {}
    }

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let user = await User.findOne({ email: normalizedEmail });
    const now = new Date();

    if (!user) {
      const _id = new mongoose.Types.ObjectId();
      const userId = _id.toString();
      user = new User({
        _id,
        userId,
        name: name || normalizedEmail.split("@")[0],
        email: normalizedEmail,
        provider: "google",
        emailVerified: true,
        verified: true,
        createdAt: now,
        updatedAt: now
      });
      await user.save();

      // Verify Google user insert
      const verifiedGoogleUser = await User.findById(user._id);
      if (!verifiedGoogleUser) {
        return res.status(500).json({ success: false, message: "Failed to insert Google user into MongoDB." });
      }

      // Record user signup activity for new Google user
      await logUserActivity(user._id, "user signup", `User registered via Google with email: ${normalizedEmail}`, { email: normalizedEmail, provider: "google" });
      await logUserActivity(user._id, "login", `User logged in via Google: ${normalizedEmail}`, { email: normalizedEmail, provider: "google" });
    } else {
      if (user.provider !== "google") {
        user.provider = "google";
      }
      user.emailVerified = true;
      user.verified = true;
      user.updatedAt = now;
      if (!user.userId) user.userId = user._id.toString();
      await user.save();

      await logUserActivity(user._id, "login", `User logged in via Google: ${normalizedEmail}`, { email: normalizedEmail, provider: "google" });
    }

    const token = generateToken(user._id);

    return res.json({
      success: true,
      message: "Google login successful.",
      token,
      user: {
        _id: user._id,
        id: user._id,
        userId: user.userId,
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
    console.error("Google auth error:", err);
    return res.status(500).json({ success: false, message: "Server error during Google auth." });
  }
});

// Log Out Endpoint
app.post("/api/auth/logout", authenticateToken, async (req, res) => {
  try {
    await logUserActivity(req.user._id, "logout", `User logged out: ${req.user.email}`, { email: req.user.email });
    return res.json({ success: true, message: "Logout activity recorded successfully." });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ success: false, message: "Server error during logout." });
  }
});

// Log Resume Upload Activity Endpoint
app.post("/api/activity/upload", authenticateToken, async (req, res) => {
  try {
    const { filename, filePath } = req.body;
    const fname = filename || "resume.pdf";
    const logged = await logUserActivity(req.user._id, "resume upload", `User uploaded resume file: ${fname}`, { filename: fname, filePath: filePath || "" });
    if (!logged) {
      return res.status(500).json({ success: false, message: "Failed to record upload activity in MongoDB." });
    }
    return res.json({ success: true, message: "Resume upload activity recorded.", activity: logged });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to record upload activity." });
  }
});

// Log Resume Download Activity Endpoint
app.post("/api/activity/download", authenticateToken, async (req, res) => {
  try {
    const { filename, format } = req.body;
    const fname = filename || "resume_report.pdf";
    const logged = await logUserActivity(req.user._id, "resume download", `User downloaded resume report for: ${fname}`, { filename: fname, downloadFormat: format || "pdf" });
    if (!logged) {
      return res.status(500).json({ success: false, message: "Failed to record download activity in MongoDB." });
    }
    return res.json({ success: true, message: "Resume download activity recorded.", activity: logged });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to record download activity." });
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
    if (name) updateData.name = name.trim();
    if (photo !== undefined) updateData.photo = photo;

    // Permanently save updates in MongoDB users collection using authenticated user's MongoDB _id
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) {
      console.error("MongoDB profile update failed for userId:", req.user._id);
      return res.status(500).json({ success: false, message: "Database profile update failed." });
    }

    await logUserActivity(updatedUser._id, "profile update", `User updated profile (Name: ${updatedUser.name})`, { name: updatedUser.name, photoUpdated: photo !== undefined });

    return res.json({
      success: true,
      message: "Profile updated successfully.",
      user: {
        _id: updatedUser._id,
        id: updatedUser._id,
        userId: updatedUser.userId || updatedUser._id.toString(),
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
    console.error("Profile update error:", err);
    return res.status(500).json({ success: false, message: "Error updating profile in MongoDB: " + err.message });
  }
});

// ==================== RESUME ANALYSIS & HISTORY ROUTES ====================

// Save Resume Analysis Entry into "User Resume Analysis" collection
// Save Resume Analysis Entry into "resume_history" collection
app.post("/api/history", authenticateToken, async (req, res) => {
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
      suggestions
    } = req.body;

    const finalName = fileName || filename || "resume.pdf";
    const finalScore = Number(atsScore !== undefined ? atsScore : (score !== undefined ? score : 0));

    if (!finalName) {
      return res.status(400).json({ success: false, message: "fileName/filename is required." });
    }

    // STRICT IDENTITY: Always save using the authenticated user's MongoDB _id!
    const authUserId = req.user._id ? req.user._id.toString() : (req.user.userId || req.user.id);

    // File reference storage: if base64 fileData provided, write to uploads/
    let savedFilePath = incomingFilePath || incomingFileUrl || "";
    if (fileData) {
      const stored = saveUploadedFile(fileData, finalName);
      if (stored) savedFilePath = stored;
    }
    if (!savedFilePath) {
      savedFilePath = `/uploads/${finalName.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
    }

    const ext = finalName.split(".").pop().toLowerCase();
    const computedFileType = fileType || (["pdf", "docx", "txt"].includes(ext) ? ext : "pdf");
    const computedAnalysisType = analysisType || (mode === "ats" ? "ATS Check" : "Full Breakdown");
    const computedAnalysisResult = analysisResult || analysisResults || {
      verdict: verdict || "Analyzed",
      atsScore: finalScore,
      score: finalScore,
      detectedSkills: Array.isArray(detectedSkills) ? detectedSkills : [],
      missingKeywords: Array.isArray(missingKeywords) ? missingKeywords : [],
      suggestions: Array.isArray(suggestions) ? suggestions : []
    };

    const analysisId = new mongoose.Types.ObjectId().toString();
    const now = new Date();

    const newHistory = new ResumeHistory({
      analysisId,
      userId: authUserId,
      fileName: finalName,
      fileType: computedFileType,
      filePath: savedFilePath,
      fileUrl: savedFilePath,
      analysisType: computedAnalysisType,
      atsScore: finalScore,
      verdict: verdict || "Analyzed",
      analysisResult: computedAnalysisResult,
      detectedSkills: Array.isArray(detectedSkills) ? detectedSkills : [],
      missingKeywords: Array.isArray(missingKeywords) ? missingKeywords : [],
      suggestions: Array.isArray(suggestions) ? suggestions : [],
      resumeText: resumeText || "",
      uploadDate: now,
      analysisDate: now,
      userEmail: req.user.email ? req.user.email.toLowerCase().trim() : ""
    });
    await newHistory.save();

    // Verify MongoDB insert operation actually succeeded in resume_history
    const verifiedHistory = await ResumeHistory.findById(newHistory._id);
    if (!verifiedHistory) {
      console.error("MongoDB history insert verification failed for analysisId:", analysisId);
      return res.status(500).json({ success: false, message: "Failed to save analysis in MongoDB resume_history." });
    }

    // Automatically record activity
    if (mode === "ats" || computedAnalysisType === "ATS Check") {
      await logUserActivity(req.user._id, "ATS score check", `User ran ATS score check for: ${finalName} (ATS Score: ${finalScore})`, { filename: finalName, score: finalScore, filePath: savedFilePath });
    } else {
      await logUserActivity(req.user._id, "resume analysis", `User completed resume analysis for: ${finalName} (Score: ${finalScore})`, { filename: finalName, score: finalScore, verdict: verdict || "Analyzed", filePath: savedFilePath });
    }

    return res.status(201).json({
      success: true,
      message: "Resume analysis record saved in MongoDB resume_history.",
      entry: {
        id: verifiedHistory.analysisId || verifiedHistory._id.toString(),
        _id: verifiedHistory._id.toString(),
        analysisId: verifiedHistory.analysisId,
        userId: verifiedHistory.userId,
        fileName: verifiedHistory.fileName,
        fileType: verifiedHistory.fileType,
        filePath: verifiedHistory.filePath,
        fileUrl: verifiedHistory.fileUrl,
        analysisType: verifiedHistory.analysisType,
        atsScore: verifiedHistory.atsScore,
        score: verifiedHistory.atsScore,
        verdict: verifiedHistory.verdict,
        analysisResult: verifiedHistory.analysisResult,
        date: verifiedHistory.analysisDate
      }
    });
  } catch (err) {
    console.error("Save history error:", err);
    return res.status(500).json({ success: false, message: "Failed to save analysis in MongoDB resume_history." });
  }
});

// Get User's Resume History
app.get("/api/history", authenticateToken, async (req, res) => {
  try {
    // 1. Get logged-in user's ID & email from verified JWT token
    const mongoUserId = req.user._id ? req.user._id.toString() : "";
    const customUserId = req.user.userId ? req.user.userId.toString() : "";
    const userEmailNorm = req.user.email ? req.user.email.toLowerCase().trim() : "";

    // 2. Query resume_history collection strictly for matching user IDs (String & ObjectId) or user email
    const orConditions = [];
    if (mongoUserId) {
      orConditions.push({ userId: mongoUserId });
      if (mongoose.Types.ObjectId.isValid(mongoUserId)) {
        orConditions.push({ userId: new mongoose.Types.ObjectId(mongoUserId) });
      }
    }
    if (customUserId && customUserId !== mongoUserId) {
      orConditions.push({ userId: customUserId });
      if (mongoose.Types.ObjectId.isValid(customUserId)) {
        orConditions.push({ userId: new mongoose.Types.ObjectId(customUserId) });
      }
    }
    if (userEmailNorm) {
      orConditions.push({ userEmail: userEmailNorm });
      orConditions.push({ email: userEmailNorm });
    }

    const queryFilter = orConditions.length > 0 ? { $or: orConditions } : { userId: mongoUserId };

    // 3. Fetch matching records from resume_history collection sorted by newest analysis date first
    const historyList = await ResumeHistory.find(queryFilter)
      .sort({ analysisDate: -1, uploadDate: -1, createdAt: -1 })
      .limit(100);

    // 4. Return formatted records for current user only
    const formattedList = historyList.map(entry => ({
      id: entry.analysisId || (entry._id ? entry._id.toString() : entry.analysisId),
      _id: entry._id ? entry._id.toString() : entry.analysisId,
      analysisId: entry.analysisId,
      userId: entry.userId ? entry.userId.toString() : "",
      fileName: entry.fileName || entry.resumeFilename || entry.filename || "resume.pdf",
      filename: entry.fileName || entry.resumeFilename || entry.filename || "resume.pdf",
      fileType: entry.fileType || "pdf",
      filePath: entry.filePath || entry.fileUrl || "",
      fileUrl: entry.fileUrl || entry.filePath || "",
      analysisType: entry.analysisType || "Resume Analysis",
      atsScore: entry.atsScore !== undefined ? entry.atsScore : (entry.score !== undefined ? entry.score : 0),
      score: entry.atsScore !== undefined ? entry.atsScore : (entry.score !== undefined ? entry.score : 0),
      verdict: entry.verdict || "Analyzed",
      status: entry.verdict || "Analyzed",
      analysisResult: entry.analysisResult || {},
      detectedSkills: entry.detectedSkills || [],
      missingKeywords: entry.missingKeywords || [],
      suggestions: entry.suggestions || [],
      uploadDate: entry.uploadDate || entry.createdAt || entry.analysisDate || new Date(),
      analysisDate: entry.analysisDate || entry.createdAt || entry.uploadDate || new Date(),
      date: entry.analysisDate || entry.uploadDate || new Date()
    }));

    return res.json({
      success: true,
      count: formattedList.length,
      history: formattedList
    });
  } catch (err) {
    console.error("Get history error:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve history from MongoDB resume_history." });
  }
});

// Get User's Activity Log
app.get("/api/activity", authenticateToken, async (req, res) => {
  try {
    const userIdStr = req.user.userId || req.user._id.toString();
    const mongoIdStr = req.user._id.toString();
    const userEmailNorm = req.user.email ? req.user.email.toLowerCase().trim() : "";

    const activities = await UserActivity.find({
      $or: [
        { userId: userIdStr },
        { userId: mongoIdStr },
        { userEmail: userEmailNorm },
        { email: userEmailNorm }
      ]
    })
      .sort({ timestamp: -1 })
      .limit(50);

    return res.json({
      success: true,
      activities: activities.map(act => ({
        id: act._id.toString(),
        userId: act.userId,
        action: act.action || act.activityType,
        activityType: act.activityType || act.action,
        description: act.description || act.activityDescription,
        activityDescription: act.activityDescription || act.description,
        timestamp: act.timestamp,
        metadata: act.metadata || {}
      }))
    });
  } catch (err) {
    console.error("Get activity error:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve activity log from MongoDB." });
  }
});

// Log Custom Activity Endpoint
app.post("/api/activity", authenticateToken, async (req, res) => {
  try {
    const { action, activityType, description, activityDescription, metadata } = req.body;
    const actName = action || activityType || "custom action";
    const descText = description || activityDescription || `User performed ${actName}`;

    // SECURITY: Always use req.user._id from verified JWT token - NEVER trust untrusted userId from body!
    const logged = await logUserActivity(req.user._id, actName, descText, metadata || {});
    return res.json({ success: true, message: "Activity logged successfully.", activity: logged });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to record activity." });
  }
});

// Delete Resume History Entry
app.delete("/api/history/:id", authenticateToken, async (req, res) => {
  try {
    const historyId = req.params.id;
    const mongoUserId = req.user._id ? req.user._id.toString() : "";
    const customUserId = req.user.userId ? req.user.userId.toString() : "";
    const userEmailNorm = req.user.email ? req.user.email.toLowerCase().trim() : "";

    const userConditions = [];
    if (mongoUserId) {
      userConditions.push({ userId: mongoUserId });
      if (mongoose.Types.ObjectId.isValid(mongoUserId)) {
        userConditions.push({ userId: new mongoose.Types.ObjectId(mongoUserId) });
      }
    }
    if (customUserId && customUserId !== mongoUserId) {
      userConditions.push({ userId: customUserId });
      if (mongoose.Types.ObjectId.isValid(customUserId)) {
        userConditions.push({ userId: new mongoose.Types.ObjectId(customUserId) });
      }
    }
    if (userEmailNorm) {
      userConditions.push({ userEmail: userEmailNorm });
      userConditions.push({ email: userEmailNorm });
    }

    const deleteFilter = {
      $and: [
        {
          $or: [
            { analysisId: historyId },
            { _id: mongoose.Types.ObjectId.isValid(historyId) ? historyId : null }
          ]
        },
        { $or: userConditions }
      ]
    };

    const deletedHistory = await ResumeHistory.findOneAndDelete(deleteFilter);

    if (!deletedHistory) {
      return res.status(404).json({ success: false, message: "History entry not found or unauthorized." });
    }

    const delFilename = deletedHistory.fileName || deletedHistory.filename || historyId;
    await logUserActivity(req.user._id, "resume deletion", `User deleted resume history entry for: ${delFilename}`, { historyId, filename: delFilename });

    return res.json({
      success: true,
      message: "History entry deleted from MongoDB resume_history."
    });
  } catch (err) {
    console.error("Delete history error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete history entry." });
  }
});

// Get Consolidated User Dashboard Data
app.get("/api/user/dashboard", authenticateToken, async (req, res) => {
  try {
    const authUserId = req.user._id.toString();
    const userEmailNorm = req.user.email ? req.user.email.toLowerCase().trim() : "";

    // 1. Fetch user's analyzed resumes strictly matching authUserId or email
    const analyses = await ResumeHistory.find({
      $or: [
        { userId: authUserId },
        { userId: req.user.userId },
        { userEmail: userEmailNorm }
      ]
    }).sort({ analysisDate: -1, date: -1, uploadDate: -1 });

    // 2. Fetch user's activity log strictly matching authUserId or email
    const activities = await UserActivity.find({
      $or: [
        { userId: authUserId },
        { userId: req.user.userId },
        { userEmail: userEmailNorm }
      ]
    }).sort({ timestamp: -1 }).limit(30);

    // Compute stats
    const totalResumes = analyses.length;
    const scores = analyses
      .map(a => Number(a.atsScore !== undefined ? a.atsScore : a.score))
      .filter(s => !isNaN(s));
    
    const latestScore = scores.length ? scores[0] : null;
    const highestScore = scores.length ? Math.max(...scores) : null;
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    const latestUpload = analyses.length ? {
      fileName: analyses[0].fileName || analyses[0].resumeFilename || analyses[0].filename,
      fileType: analyses[0].fileType || "pdf",
      filePath: analyses[0].filePath || analyses[0].fileUrl || "",
      uploadDate: analyses[0].uploadDate || analyses[0].analysisDate || analyses[0].date
    } : null;

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
      },
      stats: {
        totalResumes,
        latestScore,
        highestScore,
        avgScore,
        latestUpload
      },
      recentAnalyses: analyses.slice(0, 10).map(entry => ({
        id: entry.analysisId || entry._id.toString(),
        userId: entry.userId,
        fileName: entry.fileName || entry.resumeFilename || entry.filename,
        fileType: entry.fileType || "pdf",
        filePath: entry.filePath || entry.fileUrl || "",
        analysisType: entry.analysisType || "Resume Analysis",
        atsScore: entry.atsScore !== undefined ? entry.atsScore : entry.score,
        verdict: entry.verdict || "Analyzed",
        date: entry.analysisDate || entry.date || entry.uploadDate,
        analysisResult: entry.analysisResult || entry.analysisResults || {}
      })),
      recentActivities: activities.map(act => ({
        id: act._id.toString(),
        userId: act.userId,
        action: act.action || act.activityType,
        description: act.description || act.activityDescription,
        timestamp: act.timestamp,
        metadata: act.metadata || {}
      })),
      history: analyses.map(entry => ({
        id: entry.analysisId || entry._id.toString(),
        userId: entry.userId,
        fileName: entry.fileName || entry.resumeFilename || entry.filename,
        fileType: entry.fileType || "pdf",
        filePath: entry.filePath || entry.fileUrl || "",
        analysisType: entry.analysisType || "Resume Analysis",
        atsScore: entry.atsScore !== undefined ? entry.atsScore : entry.score,
        verdict: entry.verdict || "Analyzed",
        date: entry.analysisDate || entry.date || entry.uploadDate
      }))
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
