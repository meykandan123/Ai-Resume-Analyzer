const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  password: {
    type: String
  },
  passwordHash: {
    type: String
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  verified: {
    type: Boolean,
    default: false
  },
  provider: {
    type: String,
    enum: ["email", "google"],
    default: "email"
  },
  verifyToken: {
    type: String,
    default: null
  },
  verifyTokenExpires: {
    type: Date,
    default: null
  },
  resetToken: {
    type: String,
    default: null
  },
  resetTokenExpires: {
    type: Date,
    default: null
  },
  photo: {
    type: String,
    default: ""
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: "users",
  timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

userSchema.virtual("isVerified").get(function() {
  return Boolean(this.verified || this.emailVerified);
}).set(function(val) {
  this.verified = Boolean(val);
  this.emailVerified = Boolean(val);
});

module.exports = mongoose.model("User", userSchema, "users");
