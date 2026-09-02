const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
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
    trim: true
  },
  password: {
    type: String
  },
  provider: {
    type: String,
    enum: ["email", "google"],
    default: "email"
  },
  verified: {
    type: Boolean,
    default: false
  },
  verifyToken: {
    type: String,
    default: null
  },
  verifyTokenExpires: {
    type: Date,
    default: null
  },
  photo: {
    type: String,
    default: ""
  },
  registrationDate: {
    type: Date,
    default: Date.now
  },
  lastLoginDate: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: "users"
});

module.exports = mongoose.model("User", userSchema, "users");
