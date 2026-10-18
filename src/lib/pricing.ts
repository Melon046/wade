/**
 * Token pricing and currency formatting.
 *
 * WADE runs on free tiers, so the honest headline on the dashboard is
 * "$0.00 spent". The interesting number is *shadow spend* — what the same
 * traffic would have cost at published paid rates. That is what tells you when
 * the free tier stops being enough.
 *
 * Rates are USD per 1,000,000 tokens, from each provider's public price list.
 * They are overridable so a price change does not require a code change.
 */

export interface ModelRate {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** Human label for tables and legends. */
  label: string;
}

export const MODEL_RATES: Record<string, ModelRate> = {
  "gemini-2.5-flash": {
    input: 0.3,
    output: 2.5,
    label: "Gemini 2.5 Flash",
  },
  "gemini-2.0-flash": {
    input: 0.1,
    output: 0.4,
    label: "Gemini 2.0 Flash",
  },
  "llama-3.3-70b-versatile": {
    input: 0.59,
    output: 0.79,
    label: "Llama 3.3 70B (Groq)",
  },
  "llama-3.1-8b-instant": {
    input: 0.05,
    output: 0.08,
    label: "Llama 3.1 8B (Groq)",
  },
};

/** Used when a model id is not in the table (e.g. a newly released model). */
export const DEFAULT_RATE: ModelRate = {
  input: 0.3,
  output: 2.5,
  label: "Unknown model",
};

export function rateFor(model: string | null | undefined): ModelRate {
  if (!model) return DEFAULT_RATE;
  return MODEL_RATES[model] ?? { ...DEFAULT_RATE, label: model };
}

export function modelLabel(model: string | null | undefined): string {
  if (!model) return "Unknown";
  return MODEL_RATES[model]?.label ?? model;
}

export function providerLabel(provider: string | null | undefined): string {
  if (provider === "google") return "Gemini Flash";
  if (provider === "groq") return "Llama (Groq)";
  return provider ?? "Unknown";
}

/** Shadow cost in USD for one turn. */
export function costOf(
  model: string | null | undefined,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = rateFor(model);
  return (
    (inputTokens / 1_000_000) * rate.input +
    (outputTokens / 1_000_000) * rate.output
  );
}

/**
 * ZAR conversion. Shown as a persistent secondary annotation rather than a
 * toggle — a South African user should not have to flip a switch to see the
 * number in the currency they actually think in.
 */
export const USD_TO_ZAR = 18.42;
export const USD_TO_ZAR_AS_OF = "17 Oct 2026";

export function formatUsd(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export function formatZar(value: number): string {
  const zar = value * USD_TO_ZAR;
  if (zar === 0) return "R0.00";
  if (zar < 0.1) return `R${zar.toFixed(3)}`;
  return `R${zar.toFixed(2)}`;
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
