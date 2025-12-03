import { BarChart3, CheckCircle2, Eraser } from 'lucide-react';

import type { BenchmarkHistoryItem } from './BenchmarkHistory';

interface Props {
  results: BenchmarkHistoryItem[];
  isRunning: boolean;
  onClear: () => void;
}

export function AutoBenchmarkResults({ results, isRunning, onClear }: Props) {
  const completed = results.filter((run) => run.status === 'completed');
  const bestLatency = completed
    .map((run) => run.metrics?.latency_p95_ms)
    .filter((value): value is number => typeof value === 'number')
    .sort((a, b) => a - b)[0];
  const bestTps = completed
    .map((run) => run.metrics?.tokens_per_second)
    .filter((value): value is number => typeof value === 'number')
    .sort((a, b) => b - a)[0];

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-200">
          <BarChart3 className="h-5 w-5 text-nvidia" />
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Results</p>
            <h3 className="text-lg font-semibold">Auto benchmark outcomes</h3>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={results.length === 0}
          className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-100 transition hover:bg-slate-800 disabled:opacity-50"
        >
          <Eraser className="h-4 w-4" />
          Clear
        </button>
      </div>

      {results.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          {isRunning
            ? 'Your sweep is running. Results will stream in as combinations complete.'
            : 'Run an auto benchmark to see comparisons across your sweep matrix.'}
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <ResultCard
              label="Completed variants"
              value={`${completed.length} / ${results.length}`}
              helper="Successful runs out of the total sweep"
            />
            <ResultCard
              label="Best P95 latency"
              value={bestLatency ? `${bestLatency.toFixed(1)} ms` : '—'}
              helper="Fastest observed 95th percentile latency"
            />
            <ResultCard
              label="Peak throughput"
              value={bestTps ? `${bestTps.toFixed(2)} tok/s` : '—'}
              helper="Highest tokens-per-second across runs"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  <th className="px-3 py-2">Run</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Tokens / TPS</th>
                  <th className="px-3 py-2">Latency P95</th>
                </tr>
              </thead>
              <tbody>
                {results.map((run) => (
                  <tr key={run.id} className="border-b border-slate-800">
                    <td className="px-3 py-2 text-slate-200">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className={`h-4 w-4 ${run.status === 'completed' ? 'text-emerald-400' : 'text-slate-500'}`} />
                        <span>#{run.id}</span>
                      </div>
                      <p className="text-xs text-slate-400">{run.model_name}</p>
                    </td>
                    <td className="px-3 py-2 uppercase text-xs tracking-wide text-slate-400">{run.status}</td>
                    <td className="px-3 py-2 text-slate-200">
                      {run.metrics ? (
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{run.metrics.tokens_total ?? 0} tokens</span>
                          <span className="text-xs text-slate-400">
                            {run.metrics.tokens_per_second?.toFixed(2) ?? '0.00'} tok/s
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-200">
                      {run.metrics?.latency_p95_ms ? `${run.metrics.latency_p95_ms.toFixed(1)} ms` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

interface ResultCardProps {
  label: string;
  value: string;
  helper: string;
}

function ResultCard({ label, value, helper }: ResultCardProps) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-100">{value}</p>
      <p className="text-xs text-slate-500">{helper}</p>
    </div>
  );
}

