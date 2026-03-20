import { GoogleGenAI, Type } from "@google/genai";
import type { ClassificationResult, FilterCriteria } from "@job-alert/shared";
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
}

const DEFAULT_MODEL = "gemini-2.0-flash";
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_CALLS = 50;
const MAX_RETRIES = 2;

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
  private callCount = 0;

  constructor(config: GeminiClientConfig) {
    this.ai = new GoogleGenAI({ apiKey: config.apiKey });
    this.model = config.model ?? DEFAULT_MODEL;
    this.temperature = config.temperature ?? DEFAULT_TEMPERATURE;
    this.maxCallsPerRun = config.maxCallsPerRun ?? DEFAULT_MAX_CALLS;
    this.promptBuilder = new PromptBuilder();
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
  ): Promise<ClassificationResult> {
    if (this.callCount >= this.maxCallsPerRun) {
      throw new GeminiCallBudgetExhaustedError(this.maxCallsPerRun);
    }

    const systemInstruction = this.promptBuilder.buildSystemInstruction();
    const userPrompt = this.promptBuilder.buildUserPrompt(
      postContent,
      criteria,
    );

    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0 && this.callCount >= this.maxCallsPerRun) {
        throw new GeminiCallBudgetExhaustedError(this.maxCallsPerRun);
      }

      this.callCount++;

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: userPrompt,
        config: {
          systemInstruction,
          temperature: this.temperature,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      });

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
}
