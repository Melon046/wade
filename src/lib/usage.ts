import { costOf, modelLabel, providerLabel } from "./pricing";

/**
 * Usage aggregation for the cost dashboard.
 *
 * `usage_events` is append-only — one row per completed assistant turn — so the
 * dashboard is a pure fold over that table. Everything here is dependency-free
 * and runs on the server, which keeps the client bundle small.
 */

export interface UsageEvent {
  id: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number | null;
  fallback_used: boolean;
  created_at: string;
}

export interface DailyBucket {
  /** ISO date, e.g. 2026-10-17. */
  date: string;
  /** Short axis label, e.g. "17 Oct". */
  label: string;
  input: number;
  output: number;
  cost: number;
}

export interface ModelRow {
  model: string;
  label: string;
  provider: string;
  providerLabel: string;
  turns: number;
  input: number;
  output: number;
  cost: number;
}

export interface UsageSummary {
  days: DailyBucket[];
  models: ModelRow[];
  totals: {
    turns: number;
    input: number;
    output: number;
    tokens: number;
    shadowCost: number;
    avgLatencyMs: number | null;
    fallbackTurns: number;
    fallbackRate: number;
  };
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shortLabel(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/**
 * Build the last `dayCount` daily buckets, oldest first, including days with no
 * activity — a gap in a bar chart is information, and silently dropping empty
 * days makes a quiet week look busy.
 */
export function buildDailyBuckets(
  events: UsageEvent[],
  dayCount = 14,
  now = new Date(),
): DailyBucket[] {
  const buckets = new Map<string, DailyBucket>();

  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    date.setUTCDate(date.getUTCDate() - offset);
    buckets.set(isoDate(date), {
      date: isoDate(date),
      label: shortLabel(date),
      input: 0,
      output: 0,
      cost: 0,
    });
  }

  for (const event of events) {
    const key = event.created_at.slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.input += event.input_tokens;
    bucket.output += event.output_tokens;
    bucket.cost += costOf(event.model, event.input_tokens, event.output_tokens);
  }

  return Array.from(buckets.values());
}

export function summariseUsage(
  events: UsageEvent[],
  dayCount = 14,
  now = new Date(),
): UsageSummary {
  const days = buildDailyBuckets(events, dayCount, now);

  const byModel = new Map<string, ModelRow>();
  let input = 0;
  let output = 0;
  let shadowCost = 0;
  let latencySum = 0;
  let latencyCount = 0;
  let fallbackTurns = 0;

  for (const event of events) {
    input += event.input_tokens;
    output += event.output_tokens;
    shadowCost += costOf(event.model, event.input_tokens, event.output_tokens);
    if (event.latency_ms !== null) {
      latencySum += event.latency_ms;
      latencyCount += 1;
    }
    if (event.fallback_used) fallbackTurns += 1;

    const key = event.model;
    const row = byModel.get(key) ?? {
      model: key,
      label: modelLabel(key),
      provider: event.provider,
      providerLabel: providerLabel(event.provider),
      turns: 0,
      input: 0,
      output: 0,
      cost: 0,
    };
    row.turns += 1;
    row.input += event.input_tokens;
    row.output += event.output_tokens;
    row.cost += costOf(event.model, event.input_tokens, event.output_tokens);
    byModel.set(key, row);
  }

  const models = Array.from(byModel.values()).sort((a, b) => b.turns - a.turns);
  const turns = events.length;

  return {
    days,
    models,
    totals: {
      turns,
      input,
      output,
      tokens: input + output,
      shadowCost,
      avgLatencyMs: latencyCount > 0 ? latencySum / latencyCount : null,
      fallbackTurns,
      fallbackRate: turns > 0 ? fallbackTurns / turns : 0,
    },
  };
}

/** True when there is nothing to plot — the chart shows its empty state. */
export function isZeroUsage(summary: UsageSummary): boolean {
  return summary.totals.turns === 0;
}
