const mongoose = require("mongoose");

const userActivitySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    ref: "User"
  },
  activityType: {
    type: String,
    required: true,
    enum: ["REGISTER", "LOGIN", "LOGOUT", "RESUME_UPLOAD", "RESUME_ANALYSIS", "ATS_CHECK"]
  },
  activityDescription: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  collection: "User Activity"
});

module.exports = mongoose.model("UserActivity", userActivitySchema, "User Activity");
