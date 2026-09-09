const mongoose = require("mongoose");

const historyItemSchema = new mongoose.Schema({
  resumeId: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  analysisType: {
    type: String,
    default: "normal"
  },
  atsScore: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    default: "analyzed"
  }
}, { _id: false });

const resumeHistorySchema = new mongoose.Schema({
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
  history: {
    type: [historyItemSchema],
    default: []
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: "resume_history",
  timestamps: { createdAt: false, updatedAt: "updatedAt" }
});

module.exports = mongoose.model("ResumeHistory", resumeHistorySchema, "resume_history");
