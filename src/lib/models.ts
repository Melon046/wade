import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

/**
 * Model configuration.
 *
 * BATCHER runs on a two-provider chain so a single free tier running dry does not
 * take the app down:
 *
 *   1. Google AI Studio (Gemini Flash) — best quality on a free tier.
 *   2. Groq (Llama)                    — much larger daily request budget.
 *
 * Both providers speak the OpenAI-compatible chat-completions shape, and the
 * Vercel AI SDK normalises them behind one `LanguageModel` interface, so
 * swapping providers is a one-line change here and nothing else in the app
 * needs to know which one answered.
 *
 * Model IDs are retired by providers over time. If you start seeing 404
 * "model not found" errors, check the provider's model list and override the
 * IDs with the BATCHER_PRIMARY_MODEL / BATCHER_FALLBACK_MODEL env vars.
 */

export const PRIMARY_MODEL_ID =
  process.env.BATCHER_PRIMARY_MODEL?.trim() || "gemini-2.5-flash";

export const FALLBACK_MODEL_ID =
  process.env.BATCHER_FALLBACK_MODEL?.trim() || "llama-3.3-70b-versatile";

export type ProviderName = "google" | "groq";

export interface ModelChoice {
  provider: ProviderName;
  modelId: string;
  model: LanguageModel;
}

/** Primary provider, or null when its API key is not configured. */
export function getPrimaryModel(): ModelChoice | null {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) return null;

  const google = createGoogleGenerativeAI({ apiKey });
  return {
    provider: "google",
    modelId: PRIMARY_MODEL_ID,
    model: google(PRIMARY_MODEL_ID),
  };
}

/** Fallback provider, or null when its API key is not configured. */
export function getFallbackModel(): ModelChoice | null {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;

  const groq = createGroq({ apiKey });
  return {
    provider: "groq",
    modelId: FALLBACK_MODEL_ID,
    model: groq(FALLBACK_MODEL_ID),
  };
}

/**
 * The ordered list of providers to try. Providers without a configured key are
 * skipped, so a developer with only a Groq key still gets a working app.
 */
export function resolveModelChain(): ModelChoice[] {
  return [getPrimaryModel(), getFallbackModel()].filter(
    (choice): choice is ModelChoice => choice !== null,
  );
}

/** Human-readable label for the model picker / status pill. */
export function describeModel(choice: ModelChoice): string {
  return choice.provider === "google" ? "Gemini Flash" : "Llama (Groq)";
}
