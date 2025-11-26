import { LineChart, TrendingUp } from 'lucide-react';

import { BenchmarkHistoryItem } from './BenchmarkHistory';

interface Props {
  runs: BenchmarkHistoryItem[];
}

export function BenchmarkGraph({ runs }: Props) {
  const completed = runs.filter((run) => run.metrics?.latency_p95_ms);
  if (completed.length === 0) {
    return null;
  }

  const points = completed.map((run, idx) => {
    const latency = Number(run.metrics?.latency_p95_ms ?? 0);
    const concurrency = (run.parameters as any)?.parameters?.concurrency as number | undefined;
    return {
      x: idx,
      latency,
      label: `Run #${run.id}`,
      subtitle: concurrency ? `p95 ${latency.toFixed(1)} ms @ ${concurrency} users` : `p95 ${latency.toFixed(1)} ms`,
    };
  });

  const maxLatency = Math.max(...points.map((point) => point.latency), 1);
  const width = 600;
  const height = 220;
  const padding = 32;

  const pathD = points
    .map((point, idx) => {
      const x = padding + (idx / Math.max(points.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - (point.latency / maxLatency) * (height - padding * 2);
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <div className="mb-4 flex items-center gap-2 text-slate-200">
        <TrendingUp className="h-5 w-5 text-nvidia" />
        <h2 className="text-lg font-semibold">Benchmark latency trend</h2>
      </div>
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="relative w-full md:max-w-[640px]">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" className="w-full text-nvidia">
            <path d={pathD} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
            {points.map((point, idx) => {
              const x = padding + (idx / Math.max(points.length - 1, 1)) * (width - padding * 2);
              const y = height - padding - (point.latency / maxLatency) * (height - padding * 2);
              return (
                <g key={point.label}>
                  <circle cx={x} cy={y} r={5} className="fill-nvidia" />
                </g>
              );
            })}
          </svg>
        </div>
        <div className="flex-1 space-y-3 text-sm text-slate-300">
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <LineChart className="h-4 w-4 text-nvidia" />
            <div>
              <p className="text-slate-100">Auto-tuned runs</p>
              <p className="text-xs text-slate-400">Latest p95 latency values across completed runs.</p>
            </div>
          </div>
          <ul className="space-y-2">
            {points.map((point) => (
              <li key={point.label} className="rounded border border-slate-800 bg-slate-950/60 p-2">
                <p className="text-xs uppercase tracking-wide text-slate-400">{point.label}</p>
                <p className="text-sm text-slate-100">{point.subtitle}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
