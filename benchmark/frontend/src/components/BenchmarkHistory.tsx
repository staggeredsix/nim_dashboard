import { History } from 'lucide-react';

export type BenchmarkHistoryItem = {
  id: number;
  provider: string;
  model_name: string;
  status: string;
  created_at: string;
  completed_at?: string | null;
  metrics?: Record<string, number> | null;
  error?: string | null;
  parameters?: Record<string, unknown> | null;
};

interface Props {
  runs: BenchmarkHistoryItem[];
  isLoading: boolean;
  onRefresh: () => void;
}

export function BenchmarkHistory({ runs, isLoading, onRefresh }: Props) {
  return (
    <section className="bg-slate-900 rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-slate-300">
          <History className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Benchmark history</h2>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1 text-sm font-medium text-slate-100 hover:bg-slate-800"
        >
          Refresh
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-800 text-slate-400">
            <tr>
              <th className="px-3 py-2">Run</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Tokens / TPS</th>
              <th className="px-3 py-2">Latency P95</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && !isLoading && (
              <tr>
                <td className="px-3 py-4 text-center text-slate-500" colSpan={6}>
                  No benchmark runs yet.
                </td>
              </tr>
            )}
            {isLoading && (
              <tr>
                <td className="px-3 py-4 text-center text-slate-500" colSpan={6}>
                  Loading history…
                </td>
              </tr>
            )}
            {runs.map((run) => (
              <tr key={run.id} className="border-b border-slate-800">
                <td className="px-3 py-2 text-slate-200">#{run.id}</td>
                <td className="px-3 py-2 uppercase text-xs tracking-wide text-slate-400">{run.provider}</td>
                <td className="px-3 py-2 text-slate-200">{run.model_name}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor(run.status)}`}
                  >
                    {run.status}
                  </span>
                  {run.error && <p className="mt-1 text-xs text-red-400">{run.error}</p>}
                </td>
                <td className="px-3 py-2 text-slate-200">
                  {run.metrics ? (
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {run.metrics.tokens_total ?? 0} tokens
                      </span>
                      <span className="text-xs text-slate-400">
                        {run.metrics.tokens_per_second?.toFixed(2) ?? '0.00'} tokens/s
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
    </section>
  );
}

function statusColor(status: string) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500/20 text-emerald-400';
    case 'running':
      return 'bg-sky-500/20 text-sky-300';
    case 'failed':
      return 'bg-red-500/20 text-red-400';
    default:
      return 'bg-slate-700 text-slate-200';
  }
}
