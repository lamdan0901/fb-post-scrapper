import { GoogleGenAI, Type } from "@google/genai";
import type {
  ClassificationResult,
  FilterCriteria,
  RoleRules,
} from "@job-alert/shared";
import { PromptBuilder } from "./prompt-builder.js";
import { parseClassificationResult } from "./schemas.js";

// ── Errors ──

export class GeminiCallBudgetExhaustedError extends Error {
  constructor(limit: number) {
    super(`Gemini API call budget exhausted (limit: ${limit})`);
    this.name = "GeminiCallBudgetExhaustedError";
  }
}

export class GeminiClassificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiClassificationError";
  }
}

// ── Config ──

export interface GeminiClientConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxCallsPerRun?: number;
  /** Max requests per minute. Defaults to 5 (Gemini free-tier limit). */
  requestsPerMinute?: number;
}

const DEFAULT_MODEL = "gemini-3-flash-preview";
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_CALLS = 50;
const MAX_RETRIES = 2;
const DEFAULT_RPM = 5;

// ── Rate Limiter (sliding window) ──

class RateLimiter {
  private readonly timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs = 60_000; // 1 minute

  constructor(maxRequestsPerMinute: number) {
    this.maxRequests = maxRequestsPerMinute;
  }

  /** Wait until a request slot is available, then record the timestamp. */
  async acquire(): Promise<void> {
    while (true) {
      const now = Date.now();
      // Remove timestamps outside the window
      while (
        this.timestamps.length > 0 &&
        this.timestamps[0]! <= now - this.windowMs
      ) {
        this.timestamps.shift();
      }
      if (this.timestamps.length < this.maxRequests) {
        this.timestamps.push(now);
        return;
      }
      // Wait until the oldest request exits the window + small buffer
      const waitMs = this.timestamps[0]! - (now - this.windowMs) + 500;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

/** Gemini-compatible response schema (OpenAPI-style, not Zod). */
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    is_match: { type: Type.BOOLEAN },
    is_freelance: { type: Type.BOOLEAN },
    role: {
      type: Type.STRING,
      enum: ["Frontend", "Backend", "Fullstack", "Mobile", "Other"],
    },
    level: {
      type: Type.STRING,
      enum: ["Fresher", "Junior", "Middle", "Senior", "Unknown"],
    },
    yoe: { type: Type.NUMBER, nullable: true },
    score: { type: Type.NUMBER },
    reason: { type: Type.STRING },
  },
  required: [
    "is_match",
    "is_freelance",
    "role",
    "level",
    "yoe",
    "score",
    "reason",
  ],
} as const;

// ── Client ──

export class GeminiClient {
  private readonly ai: GoogleGenAI;
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxCallsPerRun: number;
  private readonly promptBuilder: PromptBuilder;
  private readonly rateLimiter: RateLimiter;
  private callCount = 0;

  constructor(config: GeminiClientConfig) {
    this.ai = new GoogleGenAI({ apiKey: config.apiKey });
    this.model = config.model ?? DEFAULT_MODEL;
    this.temperature = config.temperature ?? DEFAULT_TEMPERATURE;
    this.maxCallsPerRun = config.maxCallsPerRun ?? DEFAULT_MAX_CALLS;
    this.promptBuilder = new PromptBuilder();
    this.rateLimiter = new RateLimiter(config.requestsPerMinute ?? DEFAULT_RPM);
  }

  /** Reset API call counter. Call at the start of each pipeline run. */
  resetCallCount(): void {
    this.callCount = 0;
  }

  /** Number of API calls remaining in the current run. */
  get remainingCalls(): number {
    return Math.max(0, this.maxCallsPerRun - this.callCount);
  }

  /** Number of API calls made so far in the current run. */
  get callsUsed(): number {
    return this.callCount;
  }

  /**
   * Classify a preprocessed post via Gemini.
   *
   * @throws {GeminiCallBudgetExhaustedError} when budget is used up
   * @throws {GeminiClassificationError} on persistent invalid responses
   */
  async classify(
    postContent: string,
    criteria: FilterCriteria,
    options?: { commonRules?: string; roleRules?: RoleRules },
  ): Promise<ClassificationResult> {
    if (this.callCount >= this.maxCallsPerRun) {
      throw new GeminiCallBudgetExhaustedError(this.maxCallsPerRun);
    }

    const systemInstruction = this.promptBuilder.buildSystemInstruction();
    const userPrompt = this.promptBuilder.buildUserPrompt(
      postContent,
      criteria,
      options,
    );

    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0 && this.callCount >= this.maxCallsPerRun) {
        throw new GeminiCallBudgetExhaustedError(this.maxCallsPerRun);
      }

      // Respect rate limit before making the request
      await this.rateLimiter.acquire();
      this.callCount++;

      let response;
      try {
        response = await this.ai.models.generateContent({
          model: this.model,
          contents: userPrompt,
          config: {
            systemInstruction,
            temperature: this.temperature,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        });
      } catch (err: unknown) {
        // Handle 429 rate-limit errors with retry
        if (this.isRateLimitError(err)) {
          const retryAfterMs = this.extractRetryDelay(err) ?? 35_000;
          console.warn(
            `[GeminiClient] Rate limited (429). Waiting ${Math.ceil(retryAfterMs / 1000)}s before retry…`,
          );
          await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
          lastError = err;
          continue;
        }
        throw err;
      }

      const text = response.text;
      if (!text) {
        lastError = new Error("Empty response from Gemini API");
        continue;
      }

      try {
        const parsed: unknown = JSON.parse(text);
        return parseClassificationResult(parsed);
      } catch (err) {
        lastError = err;
      }
    }

    throw new GeminiClassificationError(
      `Failed to get valid classification after ${MAX_RETRIES + 1} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }

  /** Check if an error is a 429 / RESOURCE_EXHAUSTED rate-limit error. */
  private isRateLimitError(err: unknown): boolean {
    if (err && typeof err === "object") {
      const statusCode =
        (err as Record<string, unknown>).status ??
        (err as Record<string, unknown>).statusCode ??
        (err as Record<string, unknown>).httpStatusCode;
      if (statusCode === 429) return true;

      const message = (err as Record<string, unknown>).message;
      if (typeof message === "string" && message.includes("RESOURCE_EXHAUSTED"))
        return true;
    }
    return false;
  }

  /** Extract retry delay in ms from a rate-limit error, if available. */
  private extractRetryDelay(err: unknown): number | undefined {
    const message =
      err && typeof err === "object"
        ? String((err as Record<string, unknown>).message ?? "")
        : "";
    // Match "Please retry in 34.445s" or "retry in 34s" patterns
    const match = message.match(/retry in (\d+(?:\.\d+)?)s/i);
    if (match) return Math.ceil(Number(match[1]) * 1000) + 1000; // add 1s buffer
    return undefined;
  }
}
