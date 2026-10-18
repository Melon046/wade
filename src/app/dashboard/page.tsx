import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { StatCard, UsageChart } from "@/components/usage-chart";
import { summariseUsage, type UsageEvent } from "@/lib/usage";
import {
  USD_TO_ZAR,
  USD_TO_ZAR_AS_OF,
  formatLatency,
  formatPercent,
  formatTokens,
  formatUsd,
  formatZar,
} from "@/lib/pricing";

export const dynamic = "force-dynamic";

const DAYS = 14;

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (DAYS - 1));
  since.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("usage_events")
    .select(
      "id, provider, model, input_tokens, output_tokens, latency_ms, fallback_used, created_at",
    )
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true });

  const events = (data ?? []) as UsageEvent[];
  const summary = summariseUsage(events, DAYS);
  const { totals } = summary;

  return (
    <div className="min-h-dvh bg-[var(--color-canvas)]">
      <AppHeader />

      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink-1)]">
            Usage &amp; cost
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-4)]">
            Last {DAYS} days · {formatZar(1)} at R{USD_TO_ZAR}/$ ·{" "}
            {USD_TO_ZAR_AS_OF}
          </p>
        </header>

        {error ? (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            We couldn&apos;t load your usage data. Refresh the page to try again.
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Actual spend"
                value={formatUsd(0)}
                sub={`${formatZar(0)} · free tier`}
                tone="good"
              />
              <StatCard
                label="Shadow spend"
                value={formatUsd(totals.shadowCost)}
                sub={`${formatZar(totals.shadowCost)} at paid rates`}
              />
              <StatCard
                label="Tokens"
                value={formatTokens(totals.tokens)}
                sub={`${formatTokens(totals.input)} in · ${formatTokens(totals.output)} out`}
              />
              <StatCard
                label="Turns"
                value={String(totals.turns)}
                sub={`${formatLatency(totals.avgLatencyMs)} avg latency`}
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <UsageChart
                title="Tokens per day"
                description="Input and output tokens, stacked."
                days={summary.days}
                series="tokens"
                secondary
              />
              <UsageChart
                title="Estimated cost per day"
                description="What this traffic would cost at paid rates."
                days={summary.days}
                series="cost"
              />
            </div>

            <section className="mt-4 rounded-2xl border border-white/10 bg-[var(--color-panel)] p-4 sm:p-5">
              <h2 className="text-sm font-semibold tracking-tight text-[var(--color-ink-1)]">
                Provider mix
              </h2>

              {summary.models.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--color-ink-4)]">
                  No turns recorded in this window yet.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-5)]">
                        <th scope="col" className="py-2 pr-4 font-medium">
                          Model
                        </th>
                        <th scope="col" className="py-2 pr-4 text-right font-medium">
                          Turns
                        </th>
                        <th scope="col" className="py-2 pr-4 text-right font-medium">
                          Input
                        </th>
                        <th scope="col" className="py-2 pr-4 text-right font-medium">
                          Output
                        </th>
                        <th scope="col" className="py-2 text-right font-medium">
                          Shadow spend
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.models.map((row) => (
                        <tr
                          key={row.model}
                          className="border-b border-white/5 last:border-0"
                        >
                          <th
                            scope="row"
                            className="py-2.5 pr-4 text-left font-normal text-[var(--color-ink-2)]"
                          >
                            {row.label}
                            <span className="ml-2 font-mono text-[11px] text-[var(--color-ink-5)]">
                              {row.model}
                            </span>
                          </th>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-[var(--color-ink-3)]">
                            {row.turns}
                          </td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-[var(--color-ink-3)]">
                            {formatTokens(row.input)}
                          </td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-[var(--color-ink-3)]">
                            {formatTokens(row.output)}
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-[var(--color-ink-3)]">
                            {formatUsd(row.cost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {totals.turns > 0 && (
                <p className="mt-3 text-xs text-[var(--color-ink-4)]">
                  Fallback used on {formatPercent(totals.fallbackRate)} of turns (
                  {totals.fallbackTurns}/{totals.turns}).
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
