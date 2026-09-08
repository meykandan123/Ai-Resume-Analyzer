// Firebase configuration and initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCSLQ6HzZDgt-vx7O-4RKZJRhGCT3O-0bQ",
  authDomain: "resume-analyzer-a7d57.firebaseapp.com",
  projectId: "resume-analyzer-a7d57",
  storageBucket: "resume-analyzer-a7d57.firebasestorage.app",
  messagingSenderId: "356703491313",
  appId: "1:356703491313:web:546f57b08bbf126da68550",
  measurementId: "G-V9GGGHW78G"
};

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

// Expose globally on window object for accessibility across scripts
if (typeof window !== "undefined") {
  window.firebaseApp = app;
  window.firebaseAnalytics = analytics;
  window.firebaseConfig = firebaseConfig;
}

export { app, analytics, firebaseConfig };
