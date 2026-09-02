const mongoose = require("mongoose");

const userResumeAnalysisSchema = new mongoose.Schema({
  analysisId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: String,
    required: true,
    ref: "User"
  },
  resumeFilename: {
    type: String,
    required: true
  },
  filename: {
    type: String
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  atsScore: {
    type: Number,
    required: true
  },
  score: {
    type: Number
  },
  detectedSkills: {
    type: [String],
    default: []
  },
  missingKeywords: {
    type: [String],
    default: []
  },
  analysisResults: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  verdict: {
    type: String
  },
  suggestions: {
    type: [String],
    default: []
  },
  analysisDate: {
    type: Date,
    default: Date.now
  },
  date: {
    type: Date,
    default: Date.now
  },
  userEmail: {
    type: String,
    lowercase: true,
    trim: true
  },
  resumeText: {
    type: String,
    default: ""
  }
}, {
  collection: "User Resume Analysis"
});

module.exports = mongoose.model("UserResumeAnalysis", userResumeAnalysisSchema, "User Resume Analysis");
