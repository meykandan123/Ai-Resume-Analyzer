const mongoose = require("mongoose");

const supportRequestSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    default: "User"
  },
  email: {
    type: String,
    required: true,
    index: true,
    lowercase: true,
    trim: true
  },
  message: {
    type: String,
    required: true
  },
  status: {
    type: String,
    default: "Active & Sent to Support"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("SupportRequest", supportRequestSchema, "support_requests");
