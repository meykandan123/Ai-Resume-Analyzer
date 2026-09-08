// Firebase configuration and initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Your web app's Firebase configuration (supports global override if injected)
const defaultConfig = {
  apiKey: "AIzaSyCSLQ6HzZDgt-vx7O-4RKZJRhGCT3O-0bQ",
  authDomain: "resume-analyzer-a7d57.firebaseapp.com",
  projectId: "resume-analyzer-a7d57",
  storageBucket: "resume-analyzer-a7d57.firebasestorage.app",
  messagingSenderId: "356703491313",
  appId: "1:356703491313:web:546f57b08bbf126da68550",
  measurementId: "G-V9GGGHW78G"
};

const firebaseConfig = (typeof window !== "undefined" && window.firebaseConfig) 
  ? { ...defaultConfig, ...window.firebaseConfig } 
  : defaultConfig;

// Initialize Firebase
const app = initializeApp(firebaseConfig);

let analytics = null;
try {
  if (typeof window !== "undefined") {
    analytics = getAnalytics(app);
  }
} catch (err) {
  console.warn("Firebase Analytics initialization notice:", err.message || err);
}

// Initialize Firebase Auth
let auth = null;
try {
  auth = getAuth(app);
} catch (err) {
  console.warn("Firebase Auth initialization notice:", err.message || err);
}

const firebaseAuthHelpers = {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  updateProfile
};

// Expose globally on window object for accessibility across non-module scripts
if (typeof window !== "undefined") {
  window.firebaseApp = app;
  window.firebaseAnalytics = analytics;
  window.firebaseConfig = firebaseConfig;
  window.firebaseAuth = auth;
  window.firebaseAuthHelpers = firebaseAuthHelpers;
  window.GoogleAuthProvider = GoogleAuthProvider;
}

export {
  app,
  analytics,
  auth,
  firebaseConfig,
  firebaseAuthHelpers,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  updateProfile
};


