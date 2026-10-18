"use client";

import { useId } from "react";
import type { DailyBucket } from "@/lib/usage";
import { formatTokens, formatUsd } from "@/lib/pricing";

/**
 * A dependency-free accessible bar chart.
 *
 * Two things the previous version got wrong and this one fixes:
 *
 *   1. It had no x-axis labels at all — 14 anonymous bars. Every bar now has a
 *      date label underneath, with alternate labels hidden on narrow screens so
 *      they never collide.
 *   2. The SVG was the only representation of the data. The SVG is now
 *      `aria-hidden` and the real content is a visually-hidden <table>, so a
 *      screen reader gets the numbers rather than a picture of them.
 *
 * The zero-usage case is a designed state, not an empty box: it says what the
 * chart will show once there is traffic.
 */

interface UsageChartProps {
  title: string;
  description?: string;
  days: DailyBucket[];
  /** Which series to plot. */
  series: "tokens" | "cost";
  /** Optional second series stacked on top (input vs output). */
  secondary?: boolean;
}

export function UsageChart({
  title,
  description,
  days,
  series,
  secondary = false,
}: UsageChartProps) {
  const titleId = useId();
  const tableId = useId();

  const primary = days.map((day) =>
    series === "tokens" ? day.output : day.cost,
  );
  const secondaryValues = days.map((day) =>
    series === "tokens" ? day.input : 0,
  );

  const max = Math.max(
    ...primary.map((value, index) => value + (secondary ? secondaryValues[index] : 0)),
    0,
  );

  const hasData = max > 0;
  const format = series === "tokens" ? formatTokens : formatUsd;

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-2xl border border-white/10 bg-[var(--color-panel)] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id={titleId}
          className="text-sm font-semibold tracking-tight text-[var(--color-ink-1)]"
        >
          {title}
        </h2>
        {hasData && (
          <p className="text-[11px] text-[var(--color-ink-5)]">
            Peak {format(max)}
          </p>
        )}
      </div>

      {description && (
        <p className="mt-1 text-xs text-[var(--color-ink-4)]">{description}</p>
      )}

      {!hasData ? (
        <ZeroState series={series} />
      ) : (
        <>
          <div className="mt-4 flex gap-3">
            {/* Y axis — real HTML text, not SVG text, so it stays legible. */}
            <div
              aria-hidden
              className="flex h-40 flex-col justify-between py-0.5 text-right text-[10px] tabular-nums text-[var(--color-ink-5)]"
            >
              <span>{format(max)}</span>
              <span>{format(max / 2)}</span>
              <span>0</span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex h-40 items-end gap-1 border-b border-l border-white/10 pl-1">
                {days.map((day, index) => {
                  const value = primary[index];
                  const stacked = secondary ? secondaryValues[index] : 0;
                  const total = value + stacked;
                  const height = max > 0 ? (total / max) * 100 : 0;
                  const primaryShare = total > 0 ? (value / total) * 100 : 0;

                  return (
                    <div
                      key={day.date}
                      className="group relative flex h-full flex-1 flex-col justify-end"
                    >
                      <div
                        className="wade-chart-bar w-full overflow-hidden rounded-t bg-[var(--color-brand)]"
                        style={{ height: `${height}%` }}
                      >
                        {secondary && (
                          <div
                            className="w-full bg-[var(--color-violet)]/70"
                            style={{ height: `${100 - primaryShare}%` }}
                          />
                        )}
                      </div>
                      <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[var(--color-panel-2)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--color-ink-2)] group-hover:block">
                        {format(total)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* X axis — every bar labelled; alternate labels hidden on small
                  screens so they never overlap. */}
              <div aria-hidden className="mt-1.5 flex gap-1 pl-1">
                {days.map((day, index) => (
                  <span
                    key={day.date}
                    className={`flex-1 text-center text-[10px] text-[var(--color-ink-5)] ${
                      index % 2 === 1 ? "hidden sm:block" : ""
                    }`}
                  >
                    {day.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {secondary && (
            <div className="mt-3 flex items-center gap-4 text-[11px] text-[var(--color-ink-4)]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-[var(--color-brand)]" />
                Output
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-[var(--color-violet)]/70" />
                Input
              </span>
            </div>
          )}
        </>
      )}

      {/* The real content: a data table a screen reader can read. */}
      <table id={tableId} className="wade-visually-hidden">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">{series === "tokens" ? "Output tokens" : "Cost"}</th>
            {secondary && <th scope="col">Input tokens</th>}
          </tr>
        </thead>
        <tbody>
          {days.map((day, index) => (
            <tr key={day.date}>
              <th scope="row">{day.label}</th>
              <td>{format(primary[index])}</td>
              {secondary && <td>{formatTokens(secondaryValues[index])}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ZeroState({ series }: { series: "tokens" | "cost" }) {
  return (
    <div className="mt-4 flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 text-center">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] text-[var(--color-ink-5)]">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 3v18h18M7 15l3-4 3 3 5-7" />
        </svg>
      </div>
      <p className="text-sm font-medium text-[var(--color-ink-3)]">
        No usage yet
      </p>
      <p className="mt-1 max-w-xs text-xs text-[var(--color-ink-5)]">
        {series === "tokens"
          ? "Token counts will appear here after your first conversation."
          : "Estimated cost will appear here after your first conversation."}
      </p>
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warn";
}) {
  const valueTone =
    tone === "good"
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-amber-400"
        : "text-[var(--color-ink-1)]";

  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--color-panel)] p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-ink-5)]">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${valueTone}`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-[var(--color-ink-4)]">{sub}</p>}
    </div>
  );
}
