# AI Resume Analyzer 📄✨

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Author: Meykandan](https://img.shields.io/badge/Author-Meykandan-81001a.svg?style=flat&logo=github)](https://github.com/meykandan123)
[![Project: Ai-Resume-Analyzer](https://img.shields.io/badge/Project-AI%20Resume%20Analyzer-d54f60.svg)](https://github.com/meykandan123/Ai-Resume-Analyzer)
[![Node.js Version](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)

> **Free, privacy-first AI Resume Analyzer and ATS Score Optimizer.**  
> Designed, engineered, and developed by **[Meykandan](https://github.com/meykandan123)**.

---

## 🌟 Overview

**AI Resume Analyzer** is an open-access, browser-powered career tool built to empower job candidates. Over 98% of Fortune 500 companies utilize automated **Applicant Tracking Systems (ATS)** to filter out candidates before a recruiter ever reads their resume. 

Created by **Meykandan**, this platform levels the playing field by providing candidates with instant, recruiter-grade analytics:
- **ATS Compatibility Score (0–100%)**
- **Real-Time Job Description Matching & Gap Analysis**
- **Missing Technical, Soft Skills, and Industry Buzzword Detection**
- **Two-Column and Complex PDF Layout Parsing**
- **Strict Privacy-First Client-Side Text Processing**

---

## 🚀 Key Features

- **🎯 Algorithmic ATS Compatibility Scoring**: Evaluates resume hierarchy, contact information, chronological formatting, section clarity, and quantifiable metric impact.
- **🔍 Job Description Keyword Matcher**: Paste a job posting or select a job role to compute precise keyword matching percentages, uncovering required skills you might have omitted.
- **📑 Universal Multi-Format Parsing**: Supports single and complex two-column `.pdf`, Microsoft Word `.docx`, and plain text documents with zero formatting breakage.
- **⚡ 100% Client-Side Privacy**: Text extraction and scoring occur locally in the candidate's browser without transferring confidential resume data to third parties.
- **📈 Analysis History & User Profiles**: Authenticated candidates can save their past analyses, track their ATS score progression, and compare different iterations.
- **🎨 Responsive Crimson UI**: Designed with clean typography, custom CSS animations, mobile-first responsiveness, and accessibility standards.

---

## 🛠️ Technology Stack

- **Client & Frontend**: HTML5 Semantic Markup, Vanilla JavaScript (ES6+), Modern CSS3 (Grid, Flexbox, Custom Properties)
- **Document Parsers**: `PDF.js` for browser-native PDF extraction, `Mammoth.js` for `.docx` parsing
- **Backend & API**: `Node.js`, `Express 5`, RESTful API Architecture
- **Database & Auth**: `MongoDB` / `Mongoose`, `JWT`, `Firebase Authentication` & `Google Identity Services`
- **Security & Mail**: `bcryptjs` password hashing, `cors`, `dotenv`, `nodemailer`

---

## 🏁 Quick Start & Installation

### Prerequisites
- Node.js (v18.0.0 or higher recommended)
- Git

### 1. Clone the repository
```bash
git clone https://github.com/meykandan123/Ai-Resume-Analyzer.git
cd Ai-Resume-Analyzer
```

### 2. Install dependencies
```bash
npm install
```

### 3. Environment configuration
Create a `.env` file from `.env.example`:
```bash
cp .env.example .env
```
Fill in your configuration details (MongoDB URI, JWT secret, Firebase keys, port).

### 4. Run the development server
```bash
npm start
```
Open your browser at `http://localhost:3000` or the port defined in your `.env`.

---

## 🧠 How the ATS Scoring Works

The scoring algorithm created by **Meykandan** calculates an overall ATS compatibility score based on four core pillars:

1. **Structural & Formatting Health (25%)**: Evaluates standard headings, contact details (email, phone, LinkedIn), chronological date consistency, and clean section breaks.
2. **Hard & Soft Skills Presence (25%)**: Cross-references against comprehensive databases of developer, designer, management, and technical keywords.
3. **Role Relevance & Keyword Density (30%)**: Matches extracted terminology against targeted job requirements or selected job categories.
4. **Content Quality & Action Verbs (20%)**: Assesses quantifiable metrics, action verb prevalence, bullet point structure, and overused buzzwords.

---

## 👤 Author & Developer

**Meykandan**  
- **GitHub Profile**: [@meykandan123](https://github.com/meykandan123)  
- **Project Repository**: [Ai-Resume-Analyzer](https://github.com/meykandan123/Ai-Resume-Analyzer)  
- **Contact & Support**: [airesumeash@gmail.com](mailto:airesumeash@gmail.com)

If you find this project helpful, please consider giving it a ⭐ on [GitHub](https://github.com/meykandan123/Ai-Resume-Analyzer)!

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).
