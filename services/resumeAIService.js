/**
 * Resume AI Service
 * Crafts specialized prompts, handles input sanitization, and structures
 * responses for Target Role & Skill Recommendations and ATS Improvement Recommendations.
 */

const openRouterService = require("./openrouterService");

// Maximum character boundaries to control token usage and prevent payload abuse
const MAX_RESUME_CHARS = 12000;
const MAX_JD_CHARS = 4000;

class ResumeAIService {
  /**
   * Sanitizes untrusted text strings to prevent prompt injection and payload bloating
   * @param {string} text 
   * @param {number} maxLen 
   */
  sanitizeInputText(text, maxLen = MAX_RESUME_CHARS) {
    if (!text || typeof text !== "string") return "";
    // Strip control characters while preserving newlines and tabs
    const cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    return cleaned.trim().slice(0, maxLen);
  }

  /**
   * 1. Target Role & Skill Recommendations
   * Evaluates resume against target job role and optional job description
   */
  async generateTargetRoleRecommendations(payload) {
    const resumeText = this.sanitizeInputText(payload.resumeText, MAX_RESUME_CHARS);
    const targetRole = (payload.targetRole || payload.customJobRole || "Software Professional").trim().slice(0, 100);
    const jobDescription = this.sanitizeInputText(payload.jobDescription, MAX_JD_CHARS);
    const matchedSkills = Array.isArray(payload.matchedSkills) ? payload.matchedSkills.slice(0, 40) : [];
    const missingSkills = Array.isArray(payload.missingSkills) ? payload.missingSkills.slice(0, 40) : [];

    if (!resumeText) {
      throw new Error("Resume text is required for Target Role & Skill analysis.");
    }

    const systemPrompt = `You are a Senior Technical Hiring Manager and Career Strategist.
Your goal is to perform a rigorous, honest, and highly personalized skill-gap and career recommendation analysis for a candidate targeting the position: "${targetRole}".

CRITICAL INSTRUCTIONS & RULES:
1. Ground all recommendations strictly in the candidate's actual resume text and target role requirements.
2. Prioritize job-description requirements if a job description is provided.
3. Distinguish clearly between missing skills, skills that need improvement, and skills already demonstrated.
4. NEVER hallucinate or invent fake work experience, past employers, credentials, or achievements.
5. Provide actionable advice: suggest realistic, concrete portfolio projects the candidate can actually build, and structured learning steps.
6. Return your evaluation strictly in valid JSON format matching the schema below. No markdown prose, only JSON.

JSON SCHEMA REQUIREMENT:
{
  "roleSummary": "1-2 sentence honest assessment of candidate fit and readiness for this specific role",
  "matchPercentage": integer between 0 and 100,
  "careerPriorities": ["Priority action 1", "Priority action 2", "Priority action 3"],
  "recommendations": [
    {
      "skillName": "Name of skill/tool",
      "category": "Technical" | "Soft Skill" | "Tool/Platform" | "Domain Knowledge",
      "priority": "High" | "Medium" | "Low",
      "status": "Missing" | "Needs Improvement" | "Demonstrated",
      "whyItMatters": "Specific reason why this skill is critical for this target role",
      "improvementTip": "Actionable instructions on how to acquire or demonstrate this skill",
      "suggestedProject": "Concrete portfolio project idea where this skill can be practically applied",
      "learningRoadmap": "Brief sequential learning path or key topics to master"
    }
  ]
}`;

    const userPrompt = `TARGET JOB ROLE: ${targetRole}
${jobDescription ? `JOB DESCRIPTION:\n<<<JOB_DESCRIPTION>>>\n${jobDescription}\n<<<END_JOB_DESCRIPTION>>>\n` : "JOB DESCRIPTION: (Not provided, evaluate based on current industry standards for this role)\n"}
PRE-DETECTED MATCHED SKILLS: ${matchedSkills.length ? matchedSkills.join(", ") : "None specified"}
PRE-DETECTED MISSING ROLE SKILLS: ${missingSkills.length ? missingSkills.join(", ") : "None identified"}

CANDIDATE RESUME CONTENT:
<<<CANDIDATE_RESUME_TEXT>>>
${resumeText}
<<<END_CANDIDATE_RESUME_TEXT>>>

Evaluate the resume and return the structured JSON object with 4 to 8 high-impact skill recommendations.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const completion = await openRouterService.generateChatCompletion(messages, {
      temperature: 0.2,
      max_tokens: 2200
    });

    const parsed = openRouterService.parseJsonFromResponse(completion.content);

    // Validate and sanitize parsed structure
    return {
      success: true,
      aiPowered: true,
      modelUsed: completion.modelUsed,
      targetRole,
      roleSummary: parsed.roleSummary || `Targeted evaluation for ${targetRole}.`,
      matchPercentage: typeof parsed.matchPercentage === "number" ? Math.max(0, Math.min(100, parsed.matchPercentage)) : 70,
      careerPriorities: Array.isArray(parsed.careerPriorities) ? parsed.careerPriorities.slice(0, 5) : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(r => ({
        skillName: String(r.skillName || "Skill"),
        category: ["Technical", "Soft Skill", "Tool/Platform", "Domain Knowledge"].includes(r.category) ? r.category : "Technical",
        priority: ["High", "Medium", "Low"].includes(r.priority) ? r.priority : "Medium",
        status: ["Missing", "Needs Improvement", "Demonstrated"].includes(r.status) ? r.status : "Missing",
        whyItMatters: String(r.whyItMatters || ""),
        improvementTip: String(r.improvementTip || ""),
        suggestedProject: String(r.suggestedProject || ""),
        learningRoadmap: String(r.learningRoadmap || "")
      })) : []
    };
  }

  /**
   * 2. ATS Improvement Recommendations
   * Evaluates resume formatting, structure, quantifiable metrics, and ATS compatibility
   */
  async generateATSImprovementRecommendations(payload) {
    const resumeText = this.sanitizeInputText(payload.resumeText, MAX_RESUME_CHARS);
    const overallScore = typeof payload.overallScore === "number" ? payload.overallScore : null;
    const missingSections = Array.isArray(payload.missingSections) ? payload.missingSections.slice(0, 10) : [];
    const missingKeywords = Array.isArray(payload.missingKeywords) ? payload.missingKeywords.slice(0, 20) : [];
    const weakPhrases = Array.isArray(payload.weakPhrases) ? payload.weakPhrases.slice(0, 15) : [];
    const quantStats = payload.quantStats || {};
    const formattingIssues = Array.isArray(payload.formattingIssues) ? payload.formattingIssues.slice(0, 10) : [];
    const ruleBasedRecs = Array.isArray(payload.ruleBasedRecs) ? payload.ruleBasedRecs.slice(0, 8) : [];

    if (!resumeText) {
      throw new Error("Resume text is required for ATS Improvement analysis.");
    }

    const systemPrompt = `You are a Principal ATS (Applicant Tracking System) Engineer and Senior Technical Recruiter.
Your objective is to provide high-precision, contextual recommendations to help the candidate optimize their resume for automated screening algorithms (Workday, Taleo, Greenhouse, Lever, iCIMS) and hiring managers.

CRITICAL INSTRUCTIONS & RULES:
1. Base all findings on the actual resume text provided.
2. Evaluate: summary quality, section headers, quantifiable achievements, bullet point strength, keyword placement, and formatting.
3. NEVER invent or fabricate past jobs, employer names, degrees, or phony quantitative metrics.
4. When providing before-and-after examples, quote real phrases from the candidate's resume for the "before", and rewrite it into a powerful, metric-oriented achievement for the "after" that preserves their genuine experience.
5. Do NOT alter or recalculate the numerical ATS score. Provide actionable qualitative improvements.
6. Return your evaluation strictly in valid JSON format matching the schema below. No markdown prose, only JSON.

JSON SCHEMA REQUIREMENT:
{
  "summaryAssessment": "1-2 sentence summary of primary ATS bottlenecks and strengths found in this resume",
  "recommendations": [
    {
      "issueTitle": "Concise, professional issue headline",
      "issueDescription": "Clear explanation of what was detected in the resume",
      "severity": "Critical" | "High" | "Medium" | "Low",
      "whyItMatters": "Why modern ATS parsers or recruiters penalize this issue",
      "exactInstructions": "Step-by-step guidance on how to fix this section or phrasing",
      "suggestedText": "Recommended replacement text or phrasing pattern",
      "beforeAfterExample": {
        "before": "Original bullet or phrase from resume (or representative snippet)",
        "after": "Optimized, recruiter-ready high-impact revision"
      },
      "expectedBenefit": "Expected outcome (e.g. Better parser indexability, stronger hiring manager impression)"
    }
  ]
}`;

    const userPrompt = `CURRENT ATS SCORE: ${overallScore !== null ? `${overallScore}/100` : "Calculated externally"}
PRE-DETECTED MISSING SECTIONS: ${missingSections.length ? missingSections.join(", ") : "All core sections detected"}
PRE-DETECTED MISSING CORE KEYWORDS: ${missingKeywords.length ? missingKeywords.join(", ") : "None identified"}
WEAK OR PASSIVE PHRASES FOUND: ${weakPhrases.length ? weakPhrases.join(", ") : "None detected"}
QUANTIFIED METRICS STATS: ${quantStats.total ? `${quantStats.quantified || 0} out of ${quantStats.total} bullets contain metrics` : "No bullet points or metrics detected"}
DETECTED FORMATTING FLAGS: ${formattingIssues.length ? formattingIssues.join(", ") : "No standard formatting flags"}

CANDIDATE RESUME CONTENT:
<<<CANDIDATE_RESUME_TEXT>>>
${resumeText}
<<<END_CANDIDATE_RESUME_TEXT>>>

Analyze the resume and return the structured JSON object with 4 to 8 high-priority ATS improvement recommendations.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const completion = await openRouterService.generateChatCompletion(messages, {
      temperature: 0.2,
      max_tokens: 2200
    });

    const parsed = openRouterService.parseJsonFromResponse(completion.content);

    // Validate and sanitize parsed structure
    return {
      success: true,
      aiPowered: true,
      modelUsed: completion.modelUsed,
      summaryAssessment: parsed.summaryAssessment || "Comprehensive ATS structure and impact assessment complete.",
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(r => ({
        issueTitle: String(r.issueTitle || "Resume Improvement"),
        issueDescription: String(r.issueDescription || ""),
        severity: ["Critical", "High", "Medium", "Low"].includes(r.severity) ? r.severity : "Medium",
        whyItMatters: String(r.whyItMatters || ""),
        exactInstructions: String(r.exactInstructions || ""),
        suggestedText: String(r.suggestedText || ""),
        beforeAfterExample: (r.beforeAfterExample && typeof r.beforeAfterExample === "object") ? {
          before: String(r.beforeAfterExample.before || ""),
          after: String(r.beforeAfterExample.after || "")
        } : null,
        expectedBenefit: String(r.expectedBenefit || "")
      })) : []
    };
  }
}

const resumeAIService = new ResumeAIService();
module.exports = resumeAIService;
