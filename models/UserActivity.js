const mongoose = require("mongoose");

const userActivitySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
    ref: "User"
  },
  activityType: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  action: {
    type: String
  },
  activityDescription: {
    type: String
  },
  userEmail: {
    type: String,
    lowercase: true,
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  }
}, {
  collection: "user_activity",
  timestamps: true
});

module.exports = mongoose.model("UserActivity", userActivitySchema, "user_activity");
