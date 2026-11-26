/**
 * AI Recommendation Routes
 * Endpoints for Target Role & Skill Recommendations and ATS Improvement Recommendations
 */

const express = require("express");
const router = express.Router();
const openRouterService = require("../services/openrouterService");
const resumeAIService = require("../services/resumeAIService");

// In-memory rate limiting map for AI endpoints (25 requests per 15 minutes per IP)
const aiRateLimitMap = new Map();
const AI_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const AI_RATE_LIMIT_MAX = 25;

const aiRateLimiter = (req, res, next) => {
  const ip = req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "127.0.0.1";
  const now = Date.now();

  const record = aiRateLimitMap.get(ip) || { count: 0, resetTime: now + AI_RATE_LIMIT_WINDOW_MS };
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + AI_RATE_LIMIT_WINDOW_MS;
  }

  record.count += 1;
  aiRateLimitMap.set(ip, record);

  if (record.count > AI_RATE_LIMIT_MAX) {
    return res.status(429).json({
      success: false,
      fallback: true,
      error: "AI recommendation rate limit exceeded. Falling back to rule-based recommendations.",
      retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000)
    });
  }

  next();
};

/**
 * GET /api/ai/status
 * Returns whether AI recommendations are enabled and configured
 */
router.get("/status", (req, res) => {
  openRouterService.reloadConfig();
  const configured = openRouterService.isConfigured();
  res.json({
    success: true,
    aiEnabled: openRouterService.aiEnabled,
    isConfigured: configured,
    model: openRouterService.primaryModel,
    fallbackModelsCount: openRouterService.getFreeModelsSequence().length
  });
});

/**
 * POST /api/ai/target-role-recommendations
 * Generates personalized skill gap, project, and learning roadmap recommendations
 */
router.post("/target-role-recommendations", aiRateLimiter, async (req, res) => {
  try {
    const { resumeText, targetRole, customJobRole, jobDescription, matchedSkills, missingSkills } = req.body;

    if (!resumeText || typeof resumeText !== "string" || resumeText.trim().length < 20) {
      return res.status(400).json({
        success: false,
        fallback: true,
        error: "Valid resume text (minimum 20 characters) is required."
      });
    }

    if (resumeText.length > 50000) {
      return res.status(400).json({
        success: false,
        fallback: true,
        error: "Resume text exceeds maximum allowed payload size."
      });
    }

    if (!openRouterService.isConfigured()) {
      return res.status(200).json({
        success: false,
        fallback: true,
        error: "OpenRouter AI is not configured or disabled on this server. Using rule-based engine."
      });
    }

    const result = await resumeAIService.generateTargetRoleRecommendations({
      resumeText,
      targetRole,
      customJobRole,
      jobDescription,
      matchedSkills,
      missingSkills
    });

    return res.json(result);
  } catch (err) {
    console.error("[AI:TargetRole] Error:", err.message);
    return res.status(200).json({
      success: false,
      fallback: true,
      error: err.message || "Failed to generate AI target role recommendations."
    });
  }
});

/**
 * POST /api/ai/ats-improvement-recommendations
 * Generates actionable ATS recommendations, before/after examples, and formatting advice
 */
router.post("/ats-improvement-recommendations", aiRateLimiter, async (req, res) => {
  try {
    const {
      resumeText,
      overallScore,
      scoreBreakdown,
      missingSections,
      missingKeywords,
      weakPhrases,
      quantStats,
      formattingIssues,
      ruleBasedRecs
    } = req.body;

    if (!resumeText || typeof resumeText !== "string" || resumeText.trim().length < 20) {
      return res.status(400).json({
        success: false,
        fallback: true,
        error: "Valid resume text (minimum 20 characters) is required."
      });
    }

    if (resumeText.length > 50000) {
      return res.status(400).json({
        success: false,
        fallback: true,
        error: "Resume text exceeds maximum allowed payload size."
      });
    }

    if (!openRouterService.isConfigured()) {
      return res.status(200).json({
        success: false,
        fallback: true,
        error: "OpenRouter AI is not configured or disabled on this server. Using rule-based engine."
      });
    }

    const result = await resumeAIService.generateATSImprovementRecommendations({
      resumeText,
      overallScore,
      scoreBreakdown,
      missingSections,
      missingKeywords,
      weakPhrases,
      quantStats,
      formattingIssues,
      ruleBasedRecs
    });

    return res.json(result);
  } catch (err) {
    console.error("[AI:ATS] Error:", err.message);
    return res.status(200).json({
      success: false,
      fallback: true,
      error: err.message || "Failed to generate AI ATS improvement recommendations."
    });
  }
});

module.exports = router;
