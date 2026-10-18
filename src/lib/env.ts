/**
 * Environment validation.
 *
 * WADE reads a handful of env vars at boot. A typo in one of them used to fail
 * silently and confusingly: `WADE_MAX_OUTPUT_TOKENS=abc` parsed to `NaN`, the
 * provider SDK rejected every request before it was ever sent, and the route
 * reported "all providers failed" — blaming the LLM vendors for a local
 * misconfiguration. Validate once, at module load, and fail loudly instead.
 *
 * Rules
 *   * A variable that is absent or blank falls back to its default. This keeps
 *     `next build` working in an environment with no `.env.local` at all.
 *   * A variable that is *present but invalid* throws immediately, so the
 *     process refuses to start rather than serving broken turns.
 */

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

interface IntBounds {
  min: number;
  max: number;
}

function readInt(name: string, fallback: number, bounds: IntBounds): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new EnvError(
      `${name} must be a number, but got "${raw}". Fix it in .env.local (or remove it to use the default of ${fallback}).`,
    );
  }
  if (!Number.isInteger(value)) {
    throw new EnvError(`${name} must be a whole number, but got "${raw}".`);
  }
  if (value < bounds.min || value > bounds.max) {
    throw new EnvError(
      `${name} must be between ${bounds.min} and ${bounds.max}, but got ${value}.`,
    );
  }
  return value;
}

/**
 * Parsed, validated configuration. Importing this module validates the
 * environment as a side effect, so a bad value surfaces at boot.
 */
export const env = {
  /** Hard cap on a single assistant reply. */
  maxOutputTokens: readInt("WADE_MAX_OUTPUT_TOKENS", 2048, {
    min: 1,
    max: 32768,
  }),

  /**
   * Per-user daily token cap. `0` disables the check.
   *
   * Defaults to a real number rather than `0`: shipping a public link with the
   * quota silently off is how a free tier disappears overnight. 200k tokens is
   * roughly 150–200 turns — generous for one person, a hard stop for abuse.
   */
  dailyTokenLimit: readInt("WADE_DAILY_TOKEN_LIMIT", 200_000, {
    min: 0,
    max: 100_000_000,
  }),

  /** Sliding-window request cap, per user, per minute. */
  rateLimitPerMinute: readInt("WADE_RATE_LIMIT_PER_MINUTE", 20, {
    min: 1,
    max: 600,
  }),

  /** How many turns one user may have streaming at the same time. */
  rateLimitMaxConcurrent: readInt("WADE_RATE_LIMIT_MAX_CONCURRENT", 2, {
    min: 1,
    max: 20,
  }),

  /** How long to wait for a provider's first token before trying the next. */
  firstChunkTimeoutMs: readInt("WADE_FIRST_CHUNK_TIMEOUT_MS", 20_000, {
    min: 1_000,
    max: 120_000,
  }),
} as const;

/**
 * Supabase credentials are required at request time but not at build time, so
 * they are checked lazily rather than at module load.
 */
export function assertSupabaseEnv(): void {
  const missing = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter((name) => !process.env[name]?.trim());

  if (missing.length > 0) {
    throw new EnvError(
      `Missing required environment variable(s): ${missing.join(", ")}. Copy .env.example to .env.local and fill them in.`,
    );
  }
}
