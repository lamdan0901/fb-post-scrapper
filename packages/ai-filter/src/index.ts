// @job-alert/ai-filter entry point

export { ContentPreprocessor } from "./preprocessor.js";
export type { PreprocessorConfig } from "./preprocessor.js";

export { PreFilter } from "./pre-filter.js";
export type { PreFilterResult } from "./pre-filter.js";

export {
  GeminiClient,
  GeminiCallBudgetExhaustedError,
  GeminiClassificationError,
} from "./gemini-client.js";
export type { GeminiClientConfig } from "./gemini-client.js";

export { PromptBuilder } from "./prompt-builder.js";

export {
  ClassificationResultSchema,
  parseClassificationResult,
} from "./schemas.js";
export type { ClassificationResultRaw } from "./schemas.js";

export { AIFilterPipeline } from "./pipeline.js";
export type {
  PipelineInput,
  PipelineConfig,
  PipelineResult,
  PipelineStats,
  MatchedJob,
} from "./pipeline.js";
