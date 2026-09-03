const mongoose = require("mongoose");

const userActivitySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    ref: "User"
  },
  userEmail: {
    type: String,
    lowercase: true,
    trim: true
  },
  action: {
    type: String,
    required: true
  },
  activityType: {
    type: String
  },
  description: {
    type: String
  },
  activityDescription: {
    type: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  collection: "user_activity",
  timestamps: true
});

module.exports = mongoose.model("UserActivity", userActivitySchema, "user_activity");
