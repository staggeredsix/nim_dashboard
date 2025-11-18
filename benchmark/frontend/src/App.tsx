import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ServerCog } from 'lucide-react';

import { BenchmarkForm, BenchmarkFormState, BackendMetadata } from './components/BenchmarkForm';
import { BenchmarkHistory, BenchmarkHistoryItem } from './components/BenchmarkHistory';
import { ModelManager } from './components/ModelManager';
import { SummaryCards } from './components/SummaryCards';
import { getJson, postJson } from './lib/api';

export default function App() {
  const queryClient = useQueryClient();

  const backendsQuery = useQuery<BackendMetadata[]>({
    queryKey: ['backends'],
    queryFn: () => getJson('/api/backends'),
    staleTime: 10 * 60 * 1000,
  });

  const historyQuery = useQuery<{ runs: BenchmarkHistoryItem[]; total: number }>({
    queryKey: ['benchmarks'],
    queryFn: () => getJson('/api/benchmarks'),
    refetchInterval: 5000,
  });

  const scheduleBenchmark = useMutation({
    mutationFn: (payload: BenchmarkFormState) => postJson('/api/benchmarks', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['benchmarks'] });
    },
  });

  const handleSubmit = useCallback(
    (payload: BenchmarkFormState) => {
      scheduleBenchmark.mutate(payload);
    },
    [scheduleBenchmark]
  );

  const latestRun = useMemo(() => {
    if (!historyQuery.data?.runs?.length) {
      return undefined;
    }
    return historyQuery.data.runs.find((run) => run.status === 'completed') ?? historyQuery.data.runs[0];
  }, [historyQuery.data]);

  const latestAccuracy = useMemo(() => {
    const value = latestRun?.metrics?.accuracy_score;
    return typeof value === 'number' ? value : undefined;
  }, [latestRun]);

  const latestAgentic = useMemo(() => {
    const value = latestRun?.metrics?.agentic_score;
    return typeof value === 'number' ? value : undefined;
  }, [latestRun]);

  if (backendsQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <Loader2 className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 pb-16 text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-slate-300">
            <ServerCog className="h-6 w-6 text-nvidia" />
            <span className="text-sm uppercase tracking-wide text-slate-400">NIM benchmark lab</span>
          </div>
          <h1 className="text-3xl font-semibold">Benchmark orchestration dashboard</h1>
          <p className="max-w-3xl text-sm text-slate-400">
            Configure and launch benchmarks across NVIDIA NIM, vLLM, Ollama, and llama.cpp backends. Track latency,
            throughput, and tuning parameters in a single control plane.
          </p>
        </header>

        <SummaryCards
          totalRuns={historyQuery.data?.total ?? 0}
          lastLatency={latestRun?.metrics?.latency_p95_ms ?? undefined}
          lastTps={latestRun?.metrics?.tokens_per_second ?? undefined}
          lastAccuracy={latestAccuracy}
          lastAgentic={latestAgentic}
        />

        <ModelManager backends={backendsQuery.data ?? []} />

        {backendsQuery.data && backendsQuery.data.length > 0 && (
          <BenchmarkForm
            backends={backendsQuery.data}
            isSubmitting={scheduleBenchmark.isPending}
            onSubmit={handleSubmit}
          />
        )}

        <BenchmarkHistory
          runs={historyQuery.data?.runs ?? []}
          isLoading={historyQuery.isLoading}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['benchmarks'] })}
        />
      </div>
    </main>
  );
}
