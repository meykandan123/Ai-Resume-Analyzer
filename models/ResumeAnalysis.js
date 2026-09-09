const mongoose = require("mongoose");

const resumeAnalysisSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
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
  resumeId: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  resumeHash: {
    type: String,
    required: true,
    index: true
  },
  analysisType: {
    type: String,
    default: "normal"
  },
  atsScore: {
    type: Number,
    default: 0
  },
  extractedData: {
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    skills: { type: [String], default: [] },
    education: { type: [String], default: [] },
    experience: { type: [String], default: [] }
  },
  analysisResult: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  firstUploadedAt: {
    type: Date,
    default: Date.now
  },
  lastUpdatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: "resume_analysis",
  timestamps: false
});

// Compound Unique Index: userId + resumeHash + analysisType
resumeAnalysisSchema.index({ userId: 1, resumeHash: 1, analysisType: 1 }, { unique: true });

module.exports = mongoose.model("ResumeAnalysis", resumeAnalysisSchema, "resume_analysis");
