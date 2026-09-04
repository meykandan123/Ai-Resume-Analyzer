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
const UserResumeAnalysis = require("./models/UserResumeAnalysis");
const UserActivity = require("./models/UserActivity");

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

// Serve static frontend and uploaded resume files
app.use(express.static(path.join(__dirname)));
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


    // Automatically ensure collections exist in MongoDB database
    try {
      await User.createCollection();
      await UserResumeAnalysis.createCollection();
      await UserActivity.createCollection();
      console.log("Collections verified/created in Ai-Resume-Analyzer: users, resume_analysis, user_activity");
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
async function logUserActivity(userOrId, activityType, description, metadata = {}, userEmail = null) {
  try {
    // STRICT RULE: Do NOT save activities for anonymous / unauthenticated users
    if (!userOrId && !userEmail) return null;

    let targetUserId = null;
    let emailToSave = userEmail ? userEmail.toLowerCase().trim() : null;

    if (userOrId instanceof mongoose.Types.ObjectId || typeof userOrId === "string") {
      targetUserId = userOrId.toString();
    } else if (userOrId && userOrId._id) {
      targetUserId = userOrId._id.toString();
      if (!emailToSave && userOrId.email) {
        emailToSave = userOrId.email.toLowerCase().trim();
      }
    }

    if (!targetUserId) return null;

    if (!emailToSave && mongoose.Types.ObjectId.isValid(targetUserId)) {
      const u = await User.findById(targetUserId).select("email");
      if (u && u.email) emailToSave = u.email.toLowerCase().trim();
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

    // Do not create duplicate users with the same email
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
      passwordHash: hashedPassword,
      provider: "email",
      verified: false,
      verifyToken,
      verifyTokenExpires,
      createdAt: now,
      updatedAt: now,
      lastLogin: now,
      lastLoginAt: now,
      registrationDate: now,
      lastLoginDate: now,
      loginCount: 0
    });

    // Save to existing MongoDB database
    await newUser.save();

    // Verify that the MongoDB insert operation actually succeeds
    const verifiedUser = await User.findById(newUser._id);
    if (!verifiedUser) {
      console.error("MongoDB insert verification failed for userId:", userId);
      return res.status(500).json({ success: false, message: "Failed to save user into MongoDB database. Insert verification failed." });
    }

    // Automatically record signup activity
    await logUserActivity(newUser._id, "signup", `User registered with email: ${normalizedEmail}`, { email: normalizedEmail, provider: "email" });

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
      name: newUser.name,
      user: {
        _id: newUser._id,
        userId: newUser.userId,
        name: newUser.name,
        email: newUser.email,
        updatedAt: newUser.updatedAt,
        lastLoginAt: newUser.lastLoginAt,
        loginCount: newUser.loginCount
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
    const now = new Date();
    user.verified = true;
    user.verifyToken = null;
    user.verifyTokenExpires = null;
    user.lastLogin = now;
    user.lastLoginAt = now;
    user.lastLoginDate = now;
    user.updatedAt = now;
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save();

    // Automatically record login activity
    await logUserActivity(user._id, "login", `User verified email and logged in: ${user.email}`, { email: user.email, provider: user.provider });

    const jwtToken = generateToken(user._id);

    return res.json({
      success: true,
      message: "Email verified successfully! You are now logged in.",
      token: jwtToken,
      user: {
        _id: user._id,
        id: user._id,
        userId: userIdStr,
        name: user.name,
        email: user.email,
        provider: user.provider,
        photo: user.photo,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLogin: user.lastLogin,
        lastLoginAt: user.lastLoginAt,
        loginCount: user.loginCount
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
    const { email, userId, password } = req.body;

    const identifier = (email || userId || "").trim();
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: "Email/userId and password are required." });
    }

    const normalizedIdentifier = identifier.toLowerCase();

    // 1. Find the user using the existing email or userId
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

    if (!user.verified) {
      return res.status(401).json({
        success: false,
        requireVerification: true,
        message: "Please verify your email before logging in."
      });
    }

    const prevCount = user.loginCount || 0;
    const expectedCount = prevCount + 1;
    const now = new Date();

    // 2. Update lastLoginAt
    user.lastLoginAt = now;
    user.lastLogin = now;
    user.lastLoginDate = now;

    // 3. Increment loginCount
    user.loginCount = expectedCount;

    // 4. Update updatedAt
    user.updatedAt = now;

    if (!user.userId) user.userId = user._id.toString();
    if (!user.passwordHash && user.password) user.passwordHash = user.password;

    // 5. Save these changes to MongoDB (updates existing document, does not create a new one)
    await user.save();

    // Verify that the MongoDB update operation actually succeeds
    const updatedUser = await User.findById(user._id);
    if (
      !updatedUser ||
      updatedUser.loginCount !== expectedCount ||
      !updatedUser.lastLoginAt
    ) {
      console.error("MongoDB login update verification failed for userId:", user._id.toString());
      return res.status(500).json({ success: false, message: "Database update verification failed during login." });
    }

    const userIdStr = updatedUser.userId || updatedUser._id.toString();

    // Automatically record login activity
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
        provider: updatedUser.provider,
        photo: updatedUser.photo,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
        lastLogin: updatedUser.lastLogin,
        lastLoginAt: updatedUser.lastLoginAt,
        loginCount: updatedUser.loginCount
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
        loginCount: 1,
        createdAt: now,
        updatedAt: now,
        lastLogin: now,
        lastLoginAt: now,
        registrationDate: now,
        lastLoginDate: now
      });
      await user.save();

      // Verify Google user insert
      const verifiedGoogleUser = await User.findById(user._id);
      if (!verifiedGoogleUser) {
        return res.status(500).json({ success: false, message: "Failed to insert Google user into MongoDB." });
      }

      // Automatically record signup and login activities for new user
      await logUserActivity(user._id, "signup", `User registered via Google with email: ${normalizedEmail}`, { email: normalizedEmail, provider: "google" });
      await logUserActivity(user._id, "login", `User logged in via Google: ${normalizedEmail}`, { email: normalizedEmail, provider: "google" });
    } else {
      if (user.provider !== "google") {
        user.provider = "google";
      }
      user.lastLogin = now;
      user.lastLoginAt = now;
      user.lastLoginDate = now;
      user.updatedAt = now;
      user.loginCount = (user.loginCount || 0) + 1;
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
        provider: user.provider,
        photo: user.photo,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLogin: user.lastLogin,
        lastLoginAt: user.lastLoginAt,
        loginCount: user.loginCount
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
    const logged = await logUserActivity(req.user._id, "resume_upload", `User uploaded resume file: ${fname}`, { filename: fname, filePath: filePath || "" });
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
    const logged = await logUserActivity(req.user._id, "resume_download", `User downloaded resume report for: ${fname}`, { filename: fname, downloadFormat: format || "pdf" });
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
        provider: req.user.provider,
        photo: req.user.photo,
        createdAt: req.user.createdAt || req.user.registrationDate,
        updatedAt: req.user.updatedAt,
        lastLogin: req.user.lastLogin || req.user.lastLoginDate,
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

    req.user.updatedAt = new Date();
    await req.user.save();

    // Verify MongoDB update operation actually succeeded
    const verifiedUser = await User.findById(req.user._id);
    if (!verifiedUser || (name && verifiedUser.name !== name.trim())) {
      console.error("MongoDB profile update verification failed for userId:", req.user._id);
      return res.status(500).json({ success: false, message: "Database profile update verification failed." });
    }

    await logUserActivity(req.user._id, "profile_update", `User updated profile (Name: ${req.user.name})`, { name: req.user.name, photoUpdated: photo !== undefined });

    return res.json({
      success: true,
      message: "Profile updated successfully.",
      user: {
        id: verifiedUser._id,
        userId: verifiedUser.userId || verifiedUser._id.toString(),
        name: verifiedUser.name,
        email: verifiedUser.email,
        provider: verifiedUser.provider,
        photo: verifiedUser.photo,
        updatedAt: verifiedUser.updatedAt
      }
    });
  } catch (err) {
    console.error("Profile update error:", err);
    return res.status(500).json({ success: false, message: "Error updating profile in MongoDB: " + err.message });
  }
});

// ==================== RESUME ANALYSIS & HISTORY ROUTES ====================

// Save Resume Analysis Entry into "User Resume Analysis" collection
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

    // STRICT IDENTITY: Always save the authenticated user's MongoDB _id!
    const authUserId = req.user._id.toString();

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

    const newAnalysis = new UserResumeAnalysis({
      analysisId,
      userId: authUserId,
      fileName: finalName,
      resumeFilename: finalName,
      filename: finalName,
      fileType: computedFileType,
      filePath: savedFilePath,
      fileUrl: savedFilePath,
      analysisType: computedAnalysisType,
      atsScore: finalScore,
      score: finalScore,
      analysisResult: computedAnalysisResult,
      analysisResults: computedAnalysisResult,
      verdict: verdict || "Analyzed",
      detectedSkills: Array.isArray(detectedSkills) ? detectedSkills : [],
      missingKeywords: Array.isArray(missingKeywords) ? missingKeywords : [],
      suggestions: Array.isArray(suggestions) ? suggestions : [],
      uploadDate: now,
      analysisDate: now,
      date: now,
      userEmail: req.user.email ? req.user.email.toLowerCase().trim() : "",
      resumeText: resumeText || ""
    });

    await newAnalysis.save();

    // Verify MongoDB insert operation actually succeeded
    const verifiedAnalysis = await UserResumeAnalysis.findById(newAnalysis._id);
    if (!verifiedAnalysis) {
      console.error("MongoDB history insert verification failed for analysisId:", newAnalysis.analysisId);
      return res.status(500).json({ success: false, message: "Failed to save analysis in MongoDB. Insert verification failed." });
    }

    // Automatically record activity
    if (mode === "ats" || computedAnalysisType === "ATS Check") {
      await logUserActivity(req.user._id, "ats_score_check", `User ran ATS score check for: ${finalName} (ATS Score: ${finalScore})`, { filename: finalName, score: finalScore, filePath: savedFilePath });
    } else {
      await logUserActivity(req.user._id, "resume_analysis", `User completed resume analysis for: ${finalName} (Score: ${finalScore})`, { filename: finalName, score: finalScore, verdict: verdict || "Analyzed", filePath: savedFilePath });
    }

    return res.status(201).json({
      success: true,
      message: "Resume analysis record saved in MongoDB.",
      entry: {
        id: newAnalysis._id.toString(),
        analysisId: newAnalysis.analysisId,
        userId: newAnalysis.userId,
        fileName: newAnalysis.fileName,
        fileType: newAnalysis.fileType,
        filePath: newAnalysis.filePath,
        fileUrl: newAnalysis.fileUrl,
        analysisType: newAnalysis.analysisType,
        atsScore: newAnalysis.atsScore,
        analysisResult: newAnalysis.analysisResult,
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
    const userIdStr = req.user._id.toString();
    const userEmailNorm = req.user.email ? req.user.email.toLowerCase().trim() : "";

    const historyList = await UserResumeAnalysis.find({
      $or: [
        { userId: userIdStr },
        { userId: req.user.userId },
        { userEmail: userEmailNorm }
      ]
    })
      .sort({ analysisDate: -1, date: -1, uploadDate: -1 })
      .limit(100);

    const formattedList = historyList.map(entry => ({
      id: entry.analysisId || entry._id.toString(),
      userId: entry.userId,
      fileName: entry.fileName || entry.resumeFilename || entry.filename,
      filename: entry.fileName || entry.resumeFilename || entry.filename,
      fileType: entry.fileType || "pdf",
      filePath: entry.filePath || entry.fileUrl || "",
      fileUrl: entry.fileUrl || entry.filePath || "",
      analysisType: entry.analysisType || "Resume Analysis",
      atsScore: entry.atsScore !== undefined ? entry.atsScore : entry.score,
      score: entry.atsScore !== undefined ? entry.atsScore : entry.score,
      analysisResult: entry.analysisResult || entry.analysisResults || {},
      verdict: entry.verdict || "Analyzed",
      date: entry.analysisDate || entry.date || entry.uploadDate,
      detectedSkills: entry.detectedSkills || [],
      missingKeywords: entry.missingKeywords || [],
      suggestions: entry.suggestions || []
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
    const userIdStr = req.user._id.toString();
    const userEmailNorm = req.user.email ? req.user.email.toLowerCase().trim() : "";

    const activities = await UserActivity.find({
      $or: [
        { userId: userIdStr },
        { userId: req.user.userId },
        { userEmail: userEmailNorm }
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

    // Verify deletion in MongoDB database
    const checkStillExists = await UserResumeAnalysis.findById(deleted._id);
    if (checkStillExists) {
      console.error("MongoDB delete verification failed for ID:", historyId);
      return res.status(500).json({ success: false, message: "Database deletion verification failed." });
    }

    const delFilename = deleted.resumeFilename || deleted.filename || historyId;
    await logUserActivity(req.user._id, "resume deletion", `User deleted resume history entry for: ${delFilename}`, { historyId, filename: delFilename });

    return res.json({
      success: true,
      message: "History entry deleted from MongoDB."
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
    const analyses = await UserResumeAnalysis.find({
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
        provider: req.user.provider,
        photo: req.user.photo,
        createdAt: req.user.createdAt || req.user.registrationDate,
        lastLogin: req.user.lastLogin || req.user.lastLoginDate
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
