const mongoose = require("mongoose");

const resumeHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  userEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  filename: {
    type: String,
    required: true
  },
  score: {
    type: Number,
    required: true
  },
  verdict: {
    type: String,
    required: true
  },
  resumeText: {
    type: String,
    default: ""
  },
  date: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("ResumeHistory", resumeHistorySchema);
