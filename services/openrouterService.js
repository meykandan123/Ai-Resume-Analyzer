/**
 * OpenRouter AI Service
 * Handles communication with OpenRouter's official Chat Completions API
 * using strictly FREE models (:free suffix).
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Default fallback list of verified free models on OpenRouter
const DEFAULT_FREE_MODELS = [
  "openrouter/free",
  "nvidia/nemotron-3.5-lightning:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "liquid/lfm-3-1.7b:free"
];

class OpenRouterService {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || "";
    this.primaryModel = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free";
    this.siteUrl = process.env.OPENROUTER_SITE_URL || "http://localhost:5000";
    this.appName = process.env.OPENROUTER_APP_NAME || "AI Resume Analyzer";
    this.aiEnabled = process.env.AI_ENABLED !== "false" && process.env.AI_ENABLED !== false;
    this.timeoutMs = parseInt(process.env.OPENROUTER_TIMEOUT_MS, 10) || 30000;
  }

  /**
   * Refreshes credentials and config from environment dynamically
   */
  reloadConfig() {
    this.apiKey = process.env.OPENROUTER_API_KEY || "";
    this.primaryModel = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free";
    this.siteUrl = process.env.OPENROUTER_SITE_URL || "http://localhost:5000";
    this.appName = process.env.OPENROUTER_APP_NAME || "AI Resume Analyzer";
    this.aiEnabled = process.env.AI_ENABLED !== "false" && process.env.AI_ENABLED !== false;
    this.timeoutMs = parseInt(process.env.OPENROUTER_TIMEOUT_MS, 10) || 30000;
  }

  /**
   * Check if AI service is ready and enabled
   */
  isConfigured() {
    this.reloadConfig();
    return Boolean(this.aiEnabled && this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Returns list of free models to try in sequence
   */
  getFreeModelsSequence() {
    const sequence = [this.primaryModel, ...DEFAULT_FREE_MODELS];
    // Enforce :free suffix or openrouter/free to ensure zero cost
    const freeOnly = sequence.filter(m => typeof m === "string" && (m.trim().endsWith(":free") || m.trim() === "openrouter/free"));
    // Deduplicate
    return [...new Set(freeOnly)];
  }

  /**
   * Cleans model output and extracts valid JSON
   * @param {string} rawText 
   */
  parseJsonFromResponse(rawText) {
    if (!rawText || typeof rawText !== "string") {
      throw new Error("Empty response received from AI model.");
    }

    let cleaned = rawText.trim();

    // Strip markdown code fences if present (```json ... ``` or ``` ...)
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    }

    // Try direct parse first
    try {
      return JSON.parse(cleaned);
    } catch (directErr) {
      // If direct parse fails, find outermost JSON object { ... } or array [ ... ]
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const potentialJson = cleaned.substring(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(potentialJson);
        } catch (subErr) {
          // Continue to error throw below
        }
      }

      throw new Error(`Failed to parse structured JSON from AI output: ${directErr.message}`);
    }
  }

  /**
   * Execute chat completion with timeout, controlled retries, and free-model fallbacks
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} options
   */
  async generateChatCompletion(messages, options = {}) {
    this.reloadConfig();

    if (!this.aiEnabled) {
      throw new Error("AI analysis is disabled in server configuration (AI_ENABLED=false).");
    }

    if (!this.apiKey || !this.apiKey.trim()) {
      throw new Error("OpenRouter API key is missing. Set OPENROUTER_API_KEY in server environment.");
    }

    const candidateModels = this.getFreeModelsSequence();
    let lastError = null;

    for (let i = 0; i < Math.min(candidateModels.length, 3); i++) {
      const model = candidateModels[i];
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const payload = {
          model,
          messages,
          temperature: options.temperature !== undefined ? options.temperature : 0.2,
          max_tokens: options.max_tokens || 4096
        };

        if (options.response_format) {
          payload.response_format = options.response_format;
        }

        const response = await fetch(OPENROUTER_API_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey.trim()}`,
            "HTTP-Referer": this.siteUrl,
            "X-Title": this.appName,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Handle rate limits or temporary unavailable status
        if (response.status === 429 || response.status === 503 || response.status === 502) {
          const errBody = await response.text().catch(() => "");
          console.warn(`[OpenRouter] Model ${model} returned HTTP ${response.status}. Attempting free fallback...`);
          lastError = new Error(`OpenRouter HTTP ${response.status} (${model}): ${errBody || "Rate limited or model busy"}`);
          // Wait briefly before trying next candidate
          await new Promise(r => setTimeout(r, 600));
          continue;
        }

        if (!response.ok) {
          const errBody = await response.text().catch(() => "");
          throw new Error(`OpenRouter API error (HTTP ${response.status}): ${errBody || response.statusText}`);
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;

        if (!content) {
          throw new Error("Received empty choices or content from OpenRouter response.");
        }

        return {
          content,
          modelUsed: model,
          usage: data.usage || null
        };

      } catch (err) {
        clearTimeout(timeoutId);

        if (err.name === "AbortError") {
          console.warn(`[OpenRouter] Request to ${model} timed out after ${this.timeoutMs}ms.`);
          lastError = new Error(`OpenRouter model ${model} request timed out.`);
          continue;
        }

        lastError = err;
        // If it's not a rate-limit/network error, log and attempt next candidate
        console.warn(`[OpenRouter] Attempt with model ${model} failed: ${err.message}`);
      }
    }

    throw lastError || new Error("Failed to generate AI completion from all configured free models.");
  }
}

const openRouterService = new OpenRouterService();
module.exports = openRouterService;
