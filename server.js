const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const path = require("path");
const crypto = require("crypto");
const dns = require("dns");
try { dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]); } catch(e){}
require("dotenv").config();

const User = require("./models/User");
const UserResumeAnalysis = require("./models/UserResumeAnalysis");
const UserActivity = require("./models/UserActivity");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/Ai-Resume-Analyzer";
const JWT_SECRET = process.env.JWT_SECRET || "ai_resume_secret_key_987654321";

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

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


    // Automatically ensure collections exist in MongoDB database
    try {
      await User.createCollection();
      await UserResumeAnalysis.createCollection();
      await UserActivity.createCollection();
      console.log("Collections verified/created in Ai-Resume-Analyzer: users, User Resume Analysis, User Activity");
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
        await UserResumeAnalysis.createCollection();
        await UserActivity.createCollection();
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
async function logUserActivity(userId, activityType, activityDescription, userEmail = null) {
  try {
    if (!userId && !userEmail) return;
    let emailToSave = userEmail ? userEmail.toLowerCase().trim() : null;
    if (!emailToSave && userId && mongoose.Types.ObjectId.isValid(userId)) {
      const u = await User.findById(userId).select("email");
      if (u && u.email) emailToSave = u.email.toLowerCase().trim();
    }
    const activity = new UserActivity({
      userId: userId ? userId.toString() : "N/A",
      userEmail: emailToSave,
      activityType,
      activityDescription: activityDescription || `${activityType} activity recorded`,
      timestamp: new Date()
    });
    await activity.save();
  } catch (err) {
    console.error(`Failed to log activity [${activityType}]:`, err.message);
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

app.use("/api", checkDbConnection);

// Helper: Generate Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
};

// Helper: Generate Random Verification Token
const generateVerifyToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

// Helper: Send email directly to user's registered email inbox via FormSubmit API
const sendEmailToUser = async (toEmail, subject, message) => {
  if (!toEmail || typeof toEmail !== "string") return false;
  const normalized = toEmail.toLowerCase().trim();
  try {
    const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(normalized)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        _subject: subject,
        _captcha: "false",
        name: "AI Resume Analyzer",
        email: normalized,
        message: message
      })
    });
    return response.ok;
  } catch (err) {
    console.error("Failed to send email to user:", err.message);
    return false;
  }
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
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(400).json({ success: false, message: "An account with this email already exists." });
    }

    // Hash password using bcrypt - NEVER store plain text
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const verifyToken = generateVerifyToken();
    const verifyTokenExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
    const _id = new mongoose.Types.ObjectId();
    const userId = _id.toString();
    const now = new Date();

    const newUser = new User({
      _id,
      userId,
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      provider: "email",
      verified: false,
      verifyToken,
      verifyTokenExpires,
      registrationDate: now,
      lastLoginDate: now
    });

    await newUser.save();

    // Automatically record REGISTER activity
    await logUserActivity(userId, "REGISTER", `User registered with email: ${normalizedEmail}`);

    const host = req.get("host") || "localhost:5000";
    const protocol = req.protocol || "http";
    const verifyLink = `${protocol}://${host}/?verifyEmail=${encodeURIComponent(newUser.email)}&verifyToken=${verifyToken}`;
    const verificationMessage =
      `Hi ${newUser.name || "there"},\n\n` +
      `Welcome to AI Resume Analyzer!\n` +
      `Please confirm your email address by clicking the link below:\n\n` +
      `${verifyLink}\n\n` +
      `⏰ IMPORTANT: This verification link is valid for 15 minutes.\n\n` +
      `If you didn't create this account, you can safely ignore this email.`;

    sendEmailToUser(newUser.email, "Confirm your email — AI Resume Analyzer", verificationMessage).catch(() => {});

    return res.status(201).json({
      success: true,
      requireVerification: true,
      message: "Account created! A verification link has been sent to your email inbox.",
      email: newUser.email,
      name: newUser.name
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ success: false, message: "Server error during registration." });
  }
});

// Email Verification Endpoint
app.post("/api/auth/verify", async (req, res) => {
  try {
    const { email, token } = req.body;

    if (!email || !token) {
      return res.status(400).json({ success: false, message: "Email and verification token are required." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ success: false, message: "Account not found." });
    }

    const userIdStr = user.userId || user._id.toString();

    // Verification token must match, be present, and not be expired
    if (!user.verifyToken || user.verifyToken !== token || !user.verifyTokenExpires || user.verifyTokenExpires < new Date()) {
      if (user.verified) {
        return res.status(400).json({ success: false, message: "Your email is already verified. Please log in with your email and password." });
      }
      return res.status(400).json({ success: false, message: "Verification link is invalid or has expired." });
    }

    // Mark user as verified and clear verification token immediately (single-use)
    user.verified = true;
    user.verifyToken = null;
    user.verifyTokenExpires = null;
    user.lastLoginDate = new Date();
    await user.save();

    // Automatically record LOGIN activity
    await logUserActivity(userIdStr, "LOGIN", `User verified email and logged in: ${user.email}`);

    const jwtToken = generateToken(user._id);

    return res.json({
      success: true,
      message: "Email verified successfully! You are now logged in.",
      token: jwtToken,
      user: {
        id: user._id,
        userId: userIdStr,
        name: user.name,
        email: user.email,
        provider: user.provider,
        photo: user.photo
      }
    });
  } catch (err) {
    console.error("Verification error:", err);
    return res.status(500).json({ success: false, message: "Server error during verification." });
  }
});

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

    if (user.verified) {
      return res.json({ success: true, message: "Email is already verified. Please log in normally." });
    }

    const verifyToken = generateVerifyToken();
    user.verifyToken = verifyToken;
    user.verifyTokenExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    const host = req.get("host") || "localhost:5000";
    const protocol = req.protocol || "http";
    const verifyLink = `${protocol}://${host}/?verifyEmail=${encodeURIComponent(user.email)}&verifyToken=${verifyToken}`;
    const verificationMessage =
      `Hi ${user.name || "there"},\n\n` +
      `Welcome to AI Resume Analyzer!\n` +
      `Please confirm your email address by clicking the link below:\n\n` +
      `${verifyLink}\n\n` +
      `⏰ IMPORTANT: This verification link is valid for 15 minutes.\n\n` +
      `If you didn't create this account, you can safely ignore this email.`;

    sendEmailToUser(user.email, "Confirm your email — AI Resume Analyzer", verificationMessage).catch(() => {});

    return res.json({
      success: true,
      message: "Fresh verification link generated for your email inbox.",
      email: user.email,
      name: user.name
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error resending verification." });
  }
});

// Log In
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user || user.provider !== "email") {
      return res.status(400).json({ success: false, message: "Incorrect email or password." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Incorrect email or password." });
    }

    if (!user.verified) {
      return res.status(401).json({
        success: false,
        requireVerification: true,
        message: "Please verify your email before logging in."
      });
    }

    // Update lastLoginDate
    user.lastLoginDate = new Date();
    if (!user.userId) user.userId = user._id.toString();
    await user.save();

    const userIdStr = user.userId;

    // Automatically record LOGIN activity
    await logUserActivity(userIdStr, "LOGIN", `User logged in with email: ${user.email}`);

    const token = generateToken(user._id);

    return res.json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        userId: userIdStr,
        name: user.name,
        email: user.email,
        provider: user.provider,
        photo: user.photo
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

    // Hash new password using bcrypt
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetToken = null;
    user.resetTokenExpires = null;
    await user.save();

    const userIdStr = user.userId || user._id.toString();
    await logUserActivity(userIdStr, "PASSWORD_RESET", `User reset password for email: ${user.email}`);

    return res.json({
      success: true,
      message: "Password reset successfully! Please log in with your new password."
    });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ success: false, message: "Server error resetting password." });
  }
});

// Google Auth Sync
app.post("/api/auth/google", async (req, res) => {
  try {
    const { name, email } = req.body;

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
        verified: true,
        registrationDate: now,
        lastLoginDate: now
      });
      await user.save();

      // Automatically record REGISTER and LOGIN activities for new user
      await logUserActivity(userId, "REGISTER", `User registered via Google with email: ${normalizedEmail}`);
      await logUserActivity(userId, "LOGIN", `User logged in via Google: ${normalizedEmail}`);
    } else {
      if (user.provider !== "google") {
        user.provider = "google";
      }
      user.lastLoginDate = now;
      if (!user.userId) user.userId = user._id.toString();
      await user.save();

      await logUserActivity(user.userId, "LOGIN", `User logged in via Google: ${normalizedEmail}`);
    }

    const token = generateToken(user._id);

    return res.json({
      success: true,
      message: "Google login successful.",
      token,
      user: {
        id: user._id,
        userId: user.userId,
        name: user.name,
        email: user.email,
        provider: user.provider,
        photo: user.photo
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
    await logUserActivity(userIdStr, "LOGOUT", `User logged out: ${req.user.email}`);
    return res.json({ success: true, message: "Logout activity recorded successfully." });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ success: false, message: "Server error during logout." });
  }
});

// Log Resume Upload Activity Endpoint
app.post("/api/activity/upload", authenticateToken, async (req, res) => {
  try {
    const { filename } = req.body;
    const userIdStr = req.user.userId || req.user._id.toString();
    await logUserActivity(userIdStr, "RESUME_UPLOAD", `User uploaded resume file: ${filename || 'resume'}`);
    return res.json({ success: true, message: "Resume upload activity recorded." });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to record upload activity." });
  }
});

// ==================== USER PROFILE ROUTES ====================

// Get Current User Profile
app.get("/api/user/profile", authenticateToken, async (req, res) => {
  try {
    return res.json({
      success: true,
      user: {
        id: req.user._id,
        userId: req.user.userId || req.user._id.toString(),
        name: req.user.name,
        email: req.user.email,
        provider: req.user.provider,
        photo: req.user.photo,
        registrationDate: req.user.registrationDate || req.user.createdAt,
        lastLoginDate: req.user.lastLoginDate
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
    if (name) req.user.name = name.trim();
    if (photo !== undefined) req.user.photo = photo;

    await req.user.save();

    return res.json({
      success: true,
      message: "Profile updated successfully.",
      user: {
        id: req.user._id,
        userId: req.user.userId || req.user._id.toString(),
        name: req.user.name,
        email: req.user.email,
        provider: req.user.provider,
        photo: req.user.photo
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Error updating profile." });
  }
});

// ==================== RESUME ANALYSIS & HISTORY ROUTES ====================

// Save Resume Analysis Entry into "User Resume Analysis" collection
app.post("/api/history", authenticateToken, async (req, res) => {
  try {
    const {
      filename,
      score,
      verdict,
      resumeText,
      detectedSkills,
      missingKeywords,
      analysisResults,
      suggestions,
      mode
    } = req.body;

    if (!filename || score === undefined) {
      return res.status(400).json({ success: false, message: "Filename and score are required." });
    }

    const userIdStr = req.user.userId || req.user._id.toString();
    const analysisId = new mongoose.Types.ObjectId().toString();
    const now = new Date();

    const newAnalysis = new UserResumeAnalysis({
      analysisId,
      userId: userIdStr,
      resumeFilename: filename || "resume.pdf",
      filename: filename || "resume.pdf",
      uploadDate: now,
      atsScore: Number(score),
      score: Number(score),
      detectedSkills: Array.isArray(detectedSkills) ? detectedSkills : [],
      missingKeywords: Array.isArray(missingKeywords) ? missingKeywords : [],
      analysisResults: analysisResults || { verdict: verdict || "Analyzed", score: Number(score) },
      verdict: verdict || "Analyzed",
      suggestions: Array.isArray(suggestions) ? suggestions : [],
      analysisDate: now,
      date: now,
      userEmail: req.user.email ? req.user.email.toLowerCase().trim() : "",
      resumeText: resumeText || ""
    });

    await newAnalysis.save();

    // Automatically record activity based on mode or analysis type
    if (mode === "ats") {
      await logUserActivity(userIdStr, "ATS_CHECK", `User ran ATS score check for: ${filename} (ATS Score: ${score})`, req.user.email);
    } else {
      await logUserActivity(userIdStr, "RESUME_ANALYSIS", `User completed resume breakdown analysis for: ${filename} (Score: ${score})`, req.user.email);
      await logUserActivity(userIdStr, "ATS_CHECK", `User ran ATS score check for: ${filename} (ATS Score: ${score})`, req.user.email);
    }

    return res.status(201).json({
      success: true,
      message: "Resume analysis saved to MongoDB in 'User Resume Analysis' collection.",
      entry: {
        id: newAnalysis._id.toString(),
        analysisId: newAnalysis.analysisId,
        filename: newAnalysis.filename,
        score: newAnalysis.score,
        verdict: newAnalysis.verdict,
        date: newAnalysis.date
      }
    });
  } catch (err) {
    console.error("Save history error:", err);
    return res.status(500).json({ success: false, message: "Failed to save analysis in MongoDB." });
  }
});

// Get User's Resume History
app.get("/api/history", authenticateToken, async (req, res) => {
  try {
    const userIdStr = req.user.userId || req.user._id.toString();
    const userEmailNorm = req.user.email ? req.user.email.toLowerCase().trim() : "";

    const historyList = await UserResumeAnalysis.find({
      $or: [
        { userId: userIdStr },
        { userId: req.user._id.toString() },
        { userEmail: userEmailNorm }
      ]
    })
      .sort({ analysisDate: -1, date: -1, uploadDate: -1 })
      .limit(100);

    const formattedList = historyList.map(entry => ({
      id: entry.analysisId || entry._id.toString(),
      filename: entry.resumeFilename || entry.filename,
      score: entry.atsScore !== undefined ? entry.atsScore : entry.score,
      verdict: entry.verdict || "Analyzed",
      date: entry.analysisDate || entry.date || entry.uploadDate,
      detectedSkills: entry.detectedSkills || [],
      missingKeywords: entry.missingKeywords || [],
      suggestions: entry.suggestions || [],
      analysisResults: entry.analysisResults || {}
    }));

    return res.json({
      success: true,
      history: formattedList
    });
  } catch (err) {
    console.error("Get history error:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve history from MongoDB." });
  }
});

// Get User's Activity Log
app.get("/api/activity", authenticateToken, async (req, res) => {
  try {
    const userIdStr = req.user.userId || req.user._id.toString();
    const userEmailNorm = req.user.email ? req.user.email.toLowerCase().trim() : "";

    const activities = await UserActivity.find({
      $or: [
        { userId: userIdStr },
        { userId: req.user._id.toString() },
        { userEmail: userEmailNorm }
      ]
    })
      .sort({ timestamp: -1 })
      .limit(50);

    return res.json({
      success: true,
      activities: activities.map(act => ({
        id: act._id.toString(),
        activityType: act.activityType,
        activityDescription: act.activityDescription,
        timestamp: act.timestamp
      }))
    });
  } catch (err) {
    console.error("Get activity error:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve activity log from MongoDB." });
  }
});

// Delete Resume History Entry
app.delete("/api/history/:id", authenticateToken, async (req, res) => {
  try {
    const historyId = req.params.id;
    const userIdStr = req.user.userId || req.user._id.toString();
    const userEmailNorm = req.user.email ? req.user.email.toLowerCase().trim() : "";

    const deleted = await UserResumeAnalysis.findOneAndDelete({
      $and: [
        {
          $or: [
            { analysisId: historyId },
            { _id: mongoose.Types.ObjectId.isValid(historyId) ? historyId : null }
          ]
        },
        {
          $or: [
            { userId: userIdStr },
            { userId: req.user._id.toString() },
            { userEmail: userEmailNorm }
          ]
        }
      ]
    });

    if (!deleted) {
      return res.status(404).json({ success: false, message: "History entry not found or unauthorized." });
    }

    return res.json({
      success: true,
      message: "History entry deleted from MongoDB."
    });
  } catch (err) {
    console.error("Delete history error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete history entry." });
  }
});

// 404 Handler for API endpoints
app.use("/api", (req, res) => {
  return res.status(404).json({ success: false, message: "API endpoint not found." });
});

// Fallback to index.html for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Start Server
app.listen(PORT, () => {
  console.log(`AI Resume Analyzer server running on http://localhost:${PORT}`);
});
