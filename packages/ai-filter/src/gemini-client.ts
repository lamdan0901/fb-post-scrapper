import { GoogleGenAI, Type } from "@google/genai";
import type {
  ClassificationResult,
  FilterCriteria,
  RoleRules,
} from "@job-alert/shared";
import { PromptBuilder } from "./prompt-builder.js";
import {
  parseBatchClassificationResult,
  parseClassificationResult,
} from "./schemas.js";

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
  /** Number of posts to classify per API call. Defaults to 5. */
  batchSize?: number;
  /** Hard timeout for one Gemini request in milliseconds. Defaults to 90 seconds. */
  requestTimeoutMs?: number;
}

const DEFAULT_MODEL = "gemini-3-flash-preview";
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_CALLS = 50;
const MAX_RETRIES = 2;
const DEFAULT_RPM = 5;
const DEFAULT_BATCH_SIZE = 4;
const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;
const RATE_LIMIT_MODEL_CYCLE = [
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
] as const;

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

  /** Clear limiter state, used when starting a brand-new pipeline run. */
  reset(): void {
    this.timestamps.length = 0;
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

/** Gemini-compatible batch response schema (array of classifications). */
const BATCH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          post_index: { type: Type.NUMBER },
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
          "post_index",
          "is_match",
          "is_freelance",
          "role",
          "level",
          "yoe",
          "score",
          "reason",
        ],
      },
    },
  },
  required: ["results"],
} as const;

// ── Client ──

export class GeminiClient {
  private readonly ai: GoogleGenAI;
  private readonly primaryModel: string;
  private activeModel: string;
  private readonly temperature: number;
  private readonly maxCallsPerRun: number;
  private readonly promptBuilder: PromptBuilder;
  private readonly rateLimiter: RateLimiter;
  private readonly requestTimeoutMs: number;
  readonly batchSize: number;
  private callCount = 0;

  constructor(config: GeminiClientConfig) {
    this.ai = new GoogleGenAI({ apiKey: config.apiKey });
    this.primaryModel = config.model ?? DEFAULT_MODEL;
    this.activeModel = this.primaryModel;
    this.temperature = config.temperature ?? DEFAULT_TEMPERATURE;
    this.maxCallsPerRun = config.maxCallsPerRun ?? DEFAULT_MAX_CALLS;
    this.promptBuilder = new PromptBuilder();
    this.rateLimiter = new RateLimiter(config.requestsPerMinute ?? DEFAULT_RPM);
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
    this.requestTimeoutMs =
      config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /** Reset API call counter. Call at the start of each pipeline run. */
  resetCallCount(): void {
    this.callCount = 0;
    this.activeModel = this.primaryModel;
    this.rateLimiter.reset();
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
    let parseRetryCount = 0;

    while (true) {
      if (this.callCount >= this.maxCallsPerRun) {
        throw new GeminiCallBudgetExhaustedError(this.maxCallsPerRun);
      }

      // Respect rate limit before making the request
      await this.rateLimiter.acquire();
      this.callCount++;

      let response;
      try {
        response = await this.withTimeout(
          this.ai.models.generateContent({
            model: this.activeModel,
            contents: userPrompt,
            config: {
              systemInstruction,
              temperature: this.temperature,
              responseMimeType: "application/json",
              responseSchema: RESPONSE_SCHEMA,
            },
          }),
          this.requestTimeoutMs,
          "single classification",
        );
      } catch (err: unknown) {
        if (this.isModelThrottleError(err)) {
          const retryAfterMs = this.extractRetryDelay(err) ?? 35_000;
          const failedModel = this.activeModel;
          this.rotateModelAfterThrottle();
          console.warn(
            `[GeminiClient] Model ${failedModel} throttled/unavailable. Waiting ${Math.ceil(retryAfterMs / 1000)}s before retry with ${this.activeModel}…`,
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
        parseRetryCount++;
        if (parseRetryCount > MAX_RETRIES) {
          break;
        }
        continue;
      }

      try {
        const parsed: unknown = JSON.parse(text);
        return parseClassificationResult(parsed);
      } catch (err) {
        lastError = err;
        parseRetryCount++;
        if (parseRetryCount > MAX_RETRIES) {
          break;
        }
      }
    }

    throw new GeminiClassificationError(
      `Failed to get valid classification after ${MAX_RETRIES + 1} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }

  /**
   * Classify multiple preprocessed posts in a single Gemini API call.
   *
   * @throws {GeminiCallBudgetExhaustedError} when budget is used up
   * @throws {GeminiClassificationError} on persistent invalid responses
   */
  async classifyBatch(
    postContents: string[],
    criteria: FilterCriteria,
    options?: { commonRules?: string; roleRules?: RoleRules },
  ): Promise<(ClassificationResult & { postIndex: number })[]> {
    if (postContents.length === 0) return [];

    if (this.callCount >= this.maxCallsPerRun) {
      throw new GeminiCallBudgetExhaustedError(this.maxCallsPerRun);
    }

    const systemInstruction = this.promptBuilder.buildSystemInstruction();
    const userPrompt = this.promptBuilder.buildBatchUserPrompt(
      postContents,
      criteria,
      options,
    );

    let lastError: unknown;
    let parseRetryCount = 0;

    while (true) {
      if (this.callCount >= this.maxCallsPerRun) {
        throw new GeminiCallBudgetExhaustedError(this.maxCallsPerRun);
      }

      await this.rateLimiter.acquire();
      this.callCount++;

      let response;
      try {
        response = await this.withTimeout(
          this.ai.models.generateContent({
            model: this.activeModel,
            contents: userPrompt,
            config: {
              systemInstruction,
              temperature: this.temperature,
              responseMimeType: "application/json",
              responseSchema: BATCH_RESPONSE_SCHEMA,
            },
          }),
          this.requestTimeoutMs,
          "batch classification",
        );
      } catch (err: unknown) {
        if (this.isModelThrottleError(err)) {
          const retryAfterMs = this.extractRetryDelay(err) ?? 35_000;
          const failedModel = this.activeModel;
          this.rotateModelAfterThrottle();
          console.warn(
            `[GeminiClient] Model ${failedModel} throttled/unavailable. Waiting ${Math.ceil(retryAfterMs / 1000)}s before retry with ${this.activeModel}…`,
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
        parseRetryCount++;
        if (parseRetryCount > MAX_RETRIES) {
          break;
        }
        continue;
      }

      try {
        const parsed: unknown = JSON.parse(text);
        return parseBatchClassificationResult(parsed);
      } catch (err) {
        lastError = err;
        parseRetryCount++;
        if (parseRetryCount > MAX_RETRIES) {
          break;
        }
      }
    }

    throw new GeminiClassificationError(
      `Failed to get valid batch classification after ${MAX_RETRIES + 1} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }

  /** Check if an error indicates model throttling or temporary unavailability. */
  private isModelThrottleError(err: unknown): boolean {
    if (err && typeof err === "object") {
      const statusCode =
        (err as Record<string, unknown>).status ??
        (err as Record<string, unknown>).statusCode ??
        (err as Record<string, unknown>).httpStatusCode;
      if (statusCode === 429) return true;
      if (statusCode === 503) return true;

      const message = String((err as Record<string, unknown>).message ?? "");
      if (message.includes("RESOURCE_EXHAUSTED")) return true;
      if (message.includes('"status":"UNAVAILABLE"')) return true;
      if (/high demand/i.test(message)) return true;
    }
    return false;
  }

  /** Rotate to the next model in the configured fallback cycle. */
  private rotateModelAfterThrottle(): void {
    const currentIndex = RATE_LIMIT_MODEL_CYCLE.indexOf(
      this.activeModel as (typeof RATE_LIMIT_MODEL_CYCLE)[number],
    );

    this.activeModel =
      currentIndex === -1
        ? RATE_LIMIT_MODEL_CYCLE[0]
        : RATE_LIMIT_MODEL_CYCLE[
            (currentIndex + 1) % RATE_LIMIT_MODEL_CYCLE.length
          ];
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

  /** Add a hard timeout so one network call cannot hang the entire run. */
  private async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    operationLabel: string,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `Gemini ${operationLabel} timed out after ${Math.ceil(timeoutMs / 1000)}s`,
          ),
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
