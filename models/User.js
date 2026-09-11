const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  // authMethods stores which authentication methods are linked to this account.
  // Possible values: "email", "google"
  // A user can have both: ["email", "google"]
  authMethods: {
    type: [String],
    default: []
  },
  password: {
    type: String
  },
  passwordHash: {
    type: String
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  verified: {
    type: Boolean,
    default: false
  },
  verifiedAt: {
    type: Date,
    default: null
  },
  googleId: {
    type: String,
    default: null,
    sparse: true
  },
  verifyToken: {
    type: String,
    default: null
  },
  verifyTokenExpires: {
    type: Date,
    default: null
  },
  resetToken: {
    type: String,
    default: null
  },
  resetTokenExpires: {
    type: Date,
    default: null
  },
  photo: {
    type: String,
    default: ""
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: "users",
  timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Backward-compat virtual: returns the "primary" auth method for display purposes.
// A linked account returns "email" because email is always the base identity.
userSchema.virtual("provider").get(function() {
  if (this.authMethods && this.authMethods.length > 0) {
    // Prefer "email" if present, otherwise first method
    return this.authMethods.includes("email") ? "email" : this.authMethods[0];
  }
  return "email";
});

userSchema.virtual("isVerified").get(function() {
  return Boolean(this.verified || this.emailVerified);
}).set(function(val) {
  this.verified = Boolean(val);
  this.emailVerified = Boolean(val);
});

module.exports = mongoose.model("User", userSchema, "users");
