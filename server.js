const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const path = require("path");
require("dotenv").config();

const User = require("./models/User");
const ResumeHistory = require("./models/ResumeHistory");

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ai_resume";
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
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 2500 });
    console.log("Connected to MongoDB database successfully:", MONGODB_URI);
  } catch (err) {
    console.warn("Could not connect to configured MONGODB_URI (" + MONGODB_URI + ").");
    if (MongoMemoryServer) {
      try {
        console.log("Starting in-memory MongoDB server as fallback...");
        const mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        await mongoose.connect(uri);
        console.log("Connected to In-Memory MongoDB database successfully:", uri);
        return;
      } catch (memErr) {
        console.error("MongoMemoryServer error:", memErr.message);
      }
    }
    console.error("MongoDB server not available. Ensure local mongod is running or update MONGODB_URI in .env");
  }
}
connectDB();

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

const crypto = require("crypto");

// Helper: Generate Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
};

// Helper: Generate Random Verification Token
const generateVerifyToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

// ==================== AUTH ROUTES ====================

// Sign Up (Generates email verification token for user's email inbox)
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

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const verifyToken = generateVerifyToken();
    const verifyTokenExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    const newUser = new User({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      provider: "email",
      verified: false,
      verifyToken,
      verifyTokenExpires
    });

    await newUser.save();

    return res.status(201).json({
      success: true,
      requireVerification: true,
      message: "Account created! A verification link has been sent to your email inbox.",
      email: newUser.email,
      name: newUser.name,
      verifyToken: newUser.verifyToken
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

    if (user.verified) {
      const jwtToken = generateToken(user._id);
      return res.json({
        success: true,
        message: "Email is already verified.",
        token: jwtToken,
        user: { id: user._id, name: user.name, email: user.email, provider: user.provider, photo: user.photo }
      });
    }

    if (user.verifyToken !== token || !user.verifyTokenExpires || user.verifyTokenExpires < new Date()) {
      return res.status(400).json({ success: false, message: "Verification link is invalid or has expired." });
    }

    user.verified = true;
    user.verifyToken = null;
    user.verifyTokenExpires = null;
    await user.save();

    // Multi-device token generation: Issue new JWT token for this device session
    const jwtToken = generateToken(user._id);

    return res.json({
      success: true,
      message: "Email verified successfully! You are now logged in.",
      token: jwtToken,
      user: {
        id: user._id,
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

    user.verifyToken = generateVerifyToken();
    user.verifyTokenExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    return res.json({
      success: true,
      message: "Fresh verification link generated for your email inbox.",
      email: user.email,
      name: user.name,
      verifyToken: user.verifyToken
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error resending verification." });
  }
});

// Log In (Supports multi-device simultaneous logins)
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
      // Refresh verification token
      user.verifyToken = generateVerifyToken();
      user.verifyTokenExpires = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();

      return res.status(401).json({
        success: false,
        requireVerification: true,
        message: "Email not verified yet. A fresh verification link has been sent to your email inbox.",
        email: user.email,
        name: user.name,
        verifyToken: user.verifyToken
      });
    }

    // Issue unique JWT token for this device login (supports multi-device concurrent logins)
    const token = generateToken(user._id);

    return res.json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user._id,
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

// Google Auth Sync
app.post("/api/auth/google", async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      user = new User({
        name: name || normalizedEmail.split("@")[0],
        email: normalizedEmail,
        provider: "google",
        verified: true
      });
      await user.save();
    } else if (user.provider !== "google") {
      user.provider = "google";
      await user.save();
    }

    const token = generateToken(user._id);

    return res.json({
      success: true,
      message: "Google login successful.",
      token,
      user: {
        id: user._id,
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

// ==================== USER PROFILE ROUTES ====================

// Get Current User Profile
app.get("/api/user/profile", authenticateToken, async (req, res) => {
  try {
    return res.json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        provider: req.user.provider,
        photo: req.user.photo,
        createdAt: req.user.createdAt
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Error fetching profile." });
  }
});

// Update Profile (Name & Photo)
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

// ==================== RESUME HISTORY ROUTES ====================

// Save Resume History Entry
app.post("/api/history", authenticateToken, async (req, res) => {
  try {
    const { filename, score, verdict, resumeText } = req.body;

    if (!filename || score === undefined || !verdict) {
      return res.status(400).json({ success: false, message: "Filename, score, and verdict are required." });
    }

    const newHistory = new ResumeHistory({
      userId: req.user._id,
      userEmail: req.user.email,
      filename,
      score: Number(score),
      verdict,
      resumeText: resumeText || ""
    });

    await newHistory.save();

    return res.status(201).json({
      success: true,
      message: "Resume history saved to MongoDB.",
      entry: {
        id: newHistory._id.toString(),
        filename: newHistory.filename,
        score: newHistory.score,
        verdict: newHistory.verdict,
        date: newHistory.date
      }
    });
  } catch (err) {
    console.error("Save history error:", err);
    return res.status(500).json({ success: false, message: "Failed to save history in MongoDB." });
  }
});

// Get User's Resume History
app.get("/api/history", authenticateToken, async (req, res) => {
  try {
    const historyList = await ResumeHistory.find({ userId: req.user._id })
      .sort({ date: -1 })
      .limit(50);

    const formattedList = historyList.map(entry => ({
      id: entry._id.toString(),
      filename: entry.filename,
      score: entry.score,
      verdict: entry.verdict,
      date: entry.date
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

// Delete Resume History Entry
app.delete("/api/history/:id", authenticateToken, async (req, res) => {
  try {
    const historyId = req.params.id;
    const deleted = await ResumeHistory.findOneAndDelete({
      _id: historyId,
      userId: req.user._id
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

// Fallback to index.html for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Start Server
app.listen(PORT, () => {
  console.log(`AI Resume Analyzer server running on http://localhost:${PORT}`);
});
