const mongoose = require("mongoose");

const resumeHistorySchema = new mongoose.Schema({
  analysisId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.Mixed,
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
  verdict: {
    type: String,
    default: "Analyzed"
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
  suggestions: {
    type: [String],
    default: []
  },
  resumeText: {
    type: String,
    default: ""
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  analysisDate: {
    type: Date,
    default: Date.now
  },
  userEmail: {
    type: String,
    lowercase: true,
    trim: true
  }
}, {
  collection: "resume_history",
  timestamps: true
});

module.exports = mongoose.model("ResumeHistory", resumeHistorySchema, "resume_history");
