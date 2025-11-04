import { Activity, Gauge, TimerReset } from 'lucide-react';

interface MetricSummaryProps {
  totalRuns: number;
  lastLatency?: number;
  lastTps?: number;
}

export function SummaryCards({ totalRuns, lastLatency, lastTps }: MetricSummaryProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <MetricCard
        title="Completed benchmarks"
        value={totalRuns.toString()}
        description="Runs persisted in the results database"
        icon={<Gauge className="h-5 w-5" />}
      />
      <MetricCard
        title="Latest P95 latency"
        value={lastLatency ? `${lastLatency.toFixed(1)} ms` : '—'}
        description="95th percentile latency from the most recent completed run"
        icon={<TimerReset className="h-5 w-5" />}
      />
      <MetricCard
        title="Latest throughput"
        value={lastTps ? `${lastTps.toFixed(2)} tok/s` : '—'}
        description="Tokens per second computed from the latest run"
        icon={<Activity className="h-5 w-5" />}
      />
    </div>
  );
}

interface CardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
}

function MetricCard({ title, value, description, icon }: CardProps) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-slate-100 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">{title}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
        </div>
        <div className="rounded-full bg-nvidia/10 p-3 text-nvidia">{icon}</div>
      </div>
      <p className="mt-3 text-xs text-slate-500">{description}</p>
    </article>
  );
}
