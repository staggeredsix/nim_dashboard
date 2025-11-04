import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Database, Download, RefreshCw, ShieldCheck, Zap } from 'lucide-react';

import type { BackendMetadata } from './BenchmarkForm';
import { getJson, postJson } from '../lib/api';

interface ModelInfo {
  name: string;
  size?: string | null;
  digest?: string | null;
  description?: string | null;
  version?: string | null;
}

interface ModelListResponse {
  provider: string;
  models: ModelInfo[];
}

interface ModelActionResponse {
  status: string;
  detail: string;
  metadata?: Record<string, unknown> | null;
}

interface Props {
  backends: BackendMetadata[];
}

export function ModelManager({ backends }: Props) {
  const defaultOllamaUrl = useMemo(
    () => backends.find((backend) => backend.provider === 'ollama')?.default_base_url ?? 'http://localhost:11434',
    [backends]
  );
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(defaultOllamaUrl);
  const [ollamaModel, setOllamaModel] = useState('llama3');
  const [ollamaModels, setOllamaModels] = useState<ModelInfo[]>([]);
  const [ollamaMessage, setOllamaMessage] = useState<string | null>(null);

  useEffect(() => {
    setOllamaBaseUrl(defaultOllamaUrl);
  }, [defaultOllamaUrl]);

  const fetchOllamaModels = useMutation({
    mutationFn: async () => {
      const params = ollamaBaseUrl ? `?base_url=${encodeURIComponent(ollamaBaseUrl)}` : '';
      return getJson<ModelListResponse>(`/api/models/ollama${params}`);
    },
    onSuccess: (data) => {
      setOllamaModels(data.models);
      setOllamaMessage(null);
    },
    onError: (error) => {
      setOllamaMessage(error instanceof Error ? error.message : 'Unable to load Ollama models');
    },
  });

  const pullOllamaModel = useMutation({
    mutationFn: async () =>
      postJson<ModelActionResponse>('/api/models/ollama/pull', {
        model_name: ollamaModel,
        base_url: ollamaBaseUrl || undefined,
        stream: false,
      }),
    onSuccess: (data) => {
      setOllamaMessage(data.detail);
      fetchOllamaModels.mutate();
    },
    onError: (error) => {
      setOllamaMessage(error instanceof Error ? error.message : 'Failed to pull model');
    },
  });

  const [ngcKey, setNgcKey] = useState('');
  const [nimOrg, setNimOrg] = useState('nvidia');
  const [nimQuery, setNimQuery] = useState('');
  const [nimImage, setNimImage] = useState('nvcr.io/nim/nemotron-3-8b-instruct');
  const [nimTag, setNimTag] = useState('latest');
  const [nimModels, setNimModels] = useState<ModelInfo[]>([]);
  const [nimMessage, setNimMessage] = useState<string | null>(null);

  const searchNimModels = useMutation({
    mutationFn: async () =>
      postJson<ModelListResponse>('/api/models/nim/search', {
        api_key: ngcKey || undefined,
        query: nimQuery || undefined,
        limit: 25,
        organization: nimOrg || 'nvidia',
      }),
    onSuccess: (data) => {
      setNimModels(data.models);
      setNimMessage(null);
    },
    onError: (error) => {
      setNimMessage(error instanceof Error ? error.message : 'Unable to query NIM catalog');
    },
  });

  const pullNimModel = useMutation({
    mutationFn: async () =>
      postJson<ModelActionResponse>('/api/models/nim/pull', {
        model_name: nimImage,
        tag: nimTag || undefined,
        api_key: ngcKey || undefined,
      }),
    onSuccess: (data) => {
      setNimMessage(data.detail);
    },
    onError: (error) => {
      setNimMessage(error instanceof Error ? error.message : 'Failed to pull NIM container');
    },
  });

  const [hfKey, setHfKey] = useState('');
  const [hfQuery, setHfQuery] = useState('');
  const [hfModel, setHfModel] = useState('meta-llama/Meta-Llama-3-8B');
  const [hfRevision, setHfRevision] = useState('');
  const [hfModels, setHfModels] = useState<ModelInfo[]>([]);
  const [hfMessage, setHfMessage] = useState<string | null>(null);

  const searchHfModels = useMutation({
    mutationFn: async () =>
      postJson<ModelListResponse>('/api/models/huggingface/search', {
        api_key: hfKey || undefined,
        query: hfQuery || undefined,
        limit: 20,
      }),
    onSuccess: (data) => {
      setHfModels(data.models);
      setHfMessage(null);
    },
    onError: (error) => {
      setHfMessage(error instanceof Error ? error.message : 'Unable to search Hugging Face');
    },
  });

  const downloadHfModel = useMutation({
    mutationFn: async () =>
      postJson<ModelActionResponse>('/api/models/huggingface/download', {
        model_id: hfModel,
        api_key: hfKey || undefined,
        revision: hfRevision || undefined,
      }),
    onSuccess: (data) => {
      setHfMessage(`${data.detail}${data.metadata?.path ? ` → ${data.metadata.path}` : ''}`);
    },
    onError: (error) => {
      setHfMessage(error instanceof Error ? error.message : 'Failed to download model');
    },
  });

  const shouldRender = backends.length > 0;
  if (!shouldRender) {
    return null;
  }

  return (
    <section className="grid gap-4 xl:grid-cols-3">
      <ProviderCard
        title="Ollama model library"
        icon={<RefreshCw className="h-5 w-5 text-nvidia" />}
        description="Pull local Ollama models and inspect what is already available on the node."
      >
        <div className="space-y-3 text-sm">
          <label className="flex flex-col gap-1 text-slate-300">
            Ollama base URL
            <input
              value={ollamaBaseUrl}
              onChange={(event) => setOllamaBaseUrl(event.target.value)}
              className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
              placeholder="http://localhost:11434"
            />
          </label>
          <div className="flex items-end gap-2">
            <label className="flex-1 text-slate-300">
              <span className="mb-1 block">Model to pull</span>
              <input
                value={ollamaModel}
                onChange={(event) => setOllamaModel(event.target.value)}
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
                placeholder="llama3"
              />
            </label>
            <button
              type="button"
              onClick={() => pullOllamaModel.mutate()}
              disabled={pullOllamaModel.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-nvidia px-3 py-2 font-semibold text-slate-950"
            >
              <Download className="h-4 w-4" />
              Pull
            </button>
          </div>
          <button
            type="button"
            onClick={() => fetchOllamaModels.mutate()}
            disabled={fetchOllamaModels.isPending}
            className="inline-flex items-center gap-2 rounded-md border border-slate-800 px-3 py-2 text-slate-200"
          >
            <Database className="h-4 w-4" />
            Refresh installed models
          </button>
          {ollamaMessage && <p className="text-xs text-amber-400">{ollamaMessage}</p>}
          <ModelList models={ollamaModels} emptyLabel="No models installed yet." />
        </div>
      </ProviderCard>

      <ProviderCard
        title="NVIDIA NIM catalog"
        icon={<ShieldCheck className="h-5 w-5 text-nvidia" />}
        description="Authenticate with an NGC API key to search and pull NIM containers."
      >
        <div className="space-y-3 text-sm">
          <label className="flex flex-col gap-1 text-slate-300">
            NGC API key
            <input
              type="password"
              value={ngcKey}
              onChange={(event) => setNgcKey(event.target.value)}
              className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
              placeholder="NGC API token"
            />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-slate-300">
              Organization
              <input
                value={nimOrg}
                onChange={(event) => setNimOrg(event.target.value)}
                className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
                placeholder="nvidia"
              />
            </label>
            <label className="flex flex-col gap-1 text-slate-300">
              Search filter
              <input
                value={nimQuery}
                onChange={(event) => setNimQuery(event.target.value)}
                className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
                placeholder="nemotron"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => searchNimModels.mutate()}
            disabled={searchNimModels.isPending}
            className="inline-flex items-center gap-2 rounded-md border border-slate-800 px-3 py-2 text-slate-200"
          >
            <RefreshCw className="h-4 w-4" />
            Search catalog
          </button>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-slate-300">
              Container image
              <input
                value={nimImage}
                onChange={(event) => setNimImage(event.target.value)}
                className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
                placeholder="nvcr.io/nim/..."
              />
            </label>
            <label className="flex flex-col gap-1 text-slate-300">
              Tag
              <input
                value={nimTag}
                onChange={(event) => setNimTag(event.target.value)}
                className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
                placeholder="latest"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => pullNimModel.mutate()}
            disabled={pullNimModel.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-nvidia px-3 py-2 font-semibold text-slate-950"
          >
            <Download className="h-4 w-4" />
            Docker pull
          </button>
          {nimMessage && <p className="text-xs text-amber-400">{nimMessage}</p>}
          <ModelList models={nimModels} emptyLabel="No catalog entries yet." />
        </div>
      </ProviderCard>

      <ProviderCard
        title="Hugging Face checkpoints"
        icon={<Zap className="h-5 w-5 text-nvidia" />}
        description="Browse gated checkpoints and trigger downloads for vLLM hosts."
      >
        <div className="space-y-3 text-sm">
          <label className="flex flex-col gap-1 text-slate-300">
            Hugging Face API key
            <input
              type="password"
              value={hfKey}
              onChange={(event) => setHfKey(event.target.value)}
              className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
              placeholder="hf_api_..."
            />
          </label>
          <div className="flex items-end gap-2">
            <label className="flex-1 text-slate-300">
              <span className="mb-1 block">Search</span>
              <input
                value={hfQuery}
                onChange={(event) => setHfQuery(event.target.value)}
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
                placeholder="Meta-Llama"
              />
            </label>
            <button
              type="button"
              onClick={() => searchHfModels.mutate()}
              disabled={searchHfModels.isPending}
              className="inline-flex items-center gap-2 rounded-md border border-slate-800 px-3 py-2 text-slate-200"
            >
              <RefreshCw className="h-4 w-4" />
              Search
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-slate-300">
              Repository ID
              <input
                value={hfModel}
                onChange={(event) => setHfModel(event.target.value)}
                className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
                placeholder="org/model"
              />
            </label>
            <label className="flex flex-col gap-1 text-slate-300">
              Revision (optional)
              <input
                value={hfRevision}
                onChange={(event) => setHfRevision(event.target.value)}
                className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
                placeholder="main"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => downloadHfModel.mutate()}
            disabled={downloadHfModel.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-nvidia px-3 py-2 font-semibold text-slate-950"
          >
            <Download className="h-4 w-4" />
            Download snapshot
          </button>
          {hfMessage && <p className="text-xs text-amber-400">{hfMessage}</p>}
          <ModelList models={hfModels} emptyLabel="No models returned yet." />
        </div>
      </ProviderCard>
    </section>
  );
}

interface ProviderCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}

function ProviderCard({ title, description, icon, children }: ProviderCardProps) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm">
      <header className="mb-4 flex items-center gap-3 text-slate-200">
        {icon}
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-xs text-slate-400">{description}</p>
        </div>
      </header>
      {children}
    </article>
  );
}

interface ModelListProps {
  models: ModelInfo[];
  emptyLabel: string;
}

function ModelList({ models, emptyLabel }: ModelListProps) {
  if (!models.length) {
    return <p className="text-xs text-slate-500">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2 text-xs text-slate-300">
      {models.map((model) => (
        <li key={`${model.name}-${model.version ?? 'latest'}`} className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
          <p className="font-semibold text-slate-100">{model.name}</p>
          {model.version && <p className="text-slate-400">Version: {model.version}</p>}
          {model.size && <p className="text-slate-400">Info: {model.size}</p>}
          {model.description && <p className="text-slate-500">{model.description}</p>}
        </li>
      ))}
    </ul>
  );
}
