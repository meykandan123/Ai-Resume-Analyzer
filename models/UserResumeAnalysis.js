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
  fileName: {
    type: String,
    required: true
  },
  resumeFilename: {
    type: String
  },
  filename: {
    type: String
  },
  fileType: {
    type: String,
    default: "pdf"
  },
  filePath: {
    type: String,
    default: ""
  },
  fileUrl: {
    type: String,
    default: ""
  },
  analysisType: {
    type: String,
    default: "Resume Analysis"
  },
  atsScore: {
    type: Number,
    required: true
  },
  score: {
    type: Number
  },
  analysisResult: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  analysisResults: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  detectedSkills: {
    type: [String],
    default: []
  },
  missingKeywords: {
    type: [String],
    default: []
  },
  verdict: {
    type: String
  },
  suggestions: {
    type: [String],
    default: []
  },
  uploadDate: {
    type: Date,
    default: Date.now
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
  collection: "resume_history",
  timestamps: true
});

module.exports = mongoose.model("UserResumeAnalysis", userResumeAnalysisSchema, "resume_history");
