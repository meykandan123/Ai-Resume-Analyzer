const mongoose = require("mongoose");

const resumeAnalysisSchema = new mongoose.Schema({
  analysisId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true,
    ref: "User"
  },
  fileName: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    default: "pdf"
  },
  filePath: {
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
  analysisResult: {
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
    type: String,
    default: "Analyzed"
  },
  suggestions: {
    type: [String],
    default: []
  },
  resumeText: {
    type: String,
    default: ""
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  userEmail: {
    type: String,
    lowercase: true,
    trim: true
  }
}, {
  collection: "resume_analysis",
  timestamps: true
});

module.exports = mongoose.model("ResumeAnalysis", resumeAnalysisSchema, "resume_analysis");
