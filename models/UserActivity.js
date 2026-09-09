const mongoose = require("mongoose");

const singleActivitySchema = new mongoose.Schema({
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
  }
}, { _id: false });

const userActivitySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    default: ""
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    default: ""
  },
  activities: {
    type: [singleActivitySchema],
    default: []
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: "user_activity",
  timestamps: { createdAt: false, updatedAt: "updatedAt" }
});

module.exports = mongoose.model("UserActivity", userActivitySchema, "user_activity");
