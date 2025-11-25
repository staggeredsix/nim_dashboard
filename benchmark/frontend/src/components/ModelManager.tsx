import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Download, Play, RefreshCw, ShieldCheck, Square, UploadCloud, Zap } from 'lucide-react';

import type { BackendMetadata } from './BenchmarkForm';
import { getJson, postFormData, postJson } from '../lib/api';

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

interface ModelRuntimeInfo {
  provider: string;
  model_name: string;
  base_url: string;
  started_at: string;
  kv_cache_mib?: number | null;
  model_path?: string | null;
}

interface ModelRuntimeListResponse {
  runtimes: ModelRuntimeInfo[];
}

type ProviderKey = 'ollama' | 'nim' | 'vllm' | 'llamacpp';

interface RuntimeInputState {
  baseUrl: string;
  model: string;
}

interface ModelRuntimePayload {
  provider: ProviderKey;
  model_name: string;
  base_url?: string;
}

interface Props {
  backends: BackendMetadata[];
}

export function ModelManager({ backends }: Props) {
  const queryClient = useQueryClient();
  const defaultOllamaUrl = useMemo(
    () => backends.find((backend) => backend.provider === 'ollama')?.default_base_url ?? 'http://localhost:11434',
    [backends]
  );
  const defaultNimUrl = useMemo(
    () => backends.find((backend) => backend.provider === 'nim')?.default_base_url ?? 'http://localhost:8001',
    [backends]
  );
  const defaultVllmUrl = useMemo(
    () => backends.find((backend) => backend.provider === 'vllm')?.default_base_url ?? 'http://localhost:8000',
    [backends]
  );
  const defaultLlamaCppUrl = useMemo(
    () => backends.find((backend) => backend.provider === 'llamacpp')?.default_base_url ?? 'http://localhost:8080',
    [backends]
  );
  const [runtimeInputs, setRuntimeInputs] = useState<Record<ProviderKey, RuntimeInputState>>({
    ollama: { baseUrl: defaultOllamaUrl, model: 'llama3' },
    nim: { baseUrl: defaultNimUrl, model: 'nvcr.io/nim/nemotron-3-8b-instruct' },
    vllm: { baseUrl: defaultVllmUrl, model: 'Meta-Llama-3-8B-Instruct' },
    llamacpp: { baseUrl: defaultLlamaCppUrl, model: 'llama-2-7b' },
  });
  const [runtimeMessages, setRuntimeMessages] = useState<Record<ProviderKey, string | null>>({
    ollama: null,
    nim: null,
    vllm: null,
    llamacpp: null,
  });
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(defaultOllamaUrl);
  const [ollamaModel, setOllamaModel] = useState('llama3');
  const [ollamaModels, setOllamaModels] = useState<ModelInfo[]>([]);
  const [ollamaMessage, setOllamaMessage] = useState<string | null>(null);
  const [uploadProvider, setUploadProvider] = useState<ProviderKey>('llamacpp');
  const [uploadDirectory, setUploadDirectory] = useState('llama-model');
  const [uploadPostprocess, setUploadPostprocess] = useState<string[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  useEffect(() => {
    setRuntimeInputs((prev) => ({
      ollama: { ...prev.ollama, baseUrl: defaultOllamaUrl },
      nim: { ...prev.nim, baseUrl: defaultNimUrl },
      vllm: { ...prev.vllm, baseUrl: defaultVllmUrl },
      llamacpp: { ...prev.llamacpp, baseUrl: defaultLlamaCppUrl },
    }));
  }, [defaultOllamaUrl, defaultNimUrl, defaultVllmUrl, defaultLlamaCppUrl]);

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

  const runtimeQuery = useQuery<ModelRuntimeListResponse>({
    queryKey: ['model-runtimes'],
    queryFn: () => getJson<ModelRuntimeListResponse>('/api/models/runtimes'),
    refetchInterval: 5000,
  });

  const runtimeProviders: Array<{
    key: ProviderKey;
    label: string;
    modelPlaceholder: string;
    basePlaceholder: string;
  }> = [
    {
      key: 'ollama',
      label: 'Ollama runtime',
      modelPlaceholder: 'llama3',
      basePlaceholder: defaultOllamaUrl,
    },
    {
      key: 'nim',
      label: 'NIM runtime',
      modelPlaceholder: 'nemotron-3-8b-instruct',
      basePlaceholder: defaultNimUrl,
    },
    {
      key: 'vllm',
      label: 'vLLM runtime',
      modelPlaceholder: 'Meta-Llama-3-8B-Instruct',
      basePlaceholder: defaultVllmUrl,
    },
    {
      key: 'llamacpp',
      label: 'llama.cpp runtime',
      modelPlaceholder: 'llama-2-7b',
      basePlaceholder: defaultLlamaCppUrl,
    },
  ];

  const runtimeData = runtimeQuery.data?.runtimes ?? [];
  const getRunningModels = (provider: ProviderKey) =>
    runtimeData.filter((runtime) => runtime.provider === provider);

  const startRuntime = useMutation<ModelActionResponse, Error, ModelRuntimePayload>({
    mutationFn: (payload) => postJson<ModelActionResponse>('/api/models/runtimes/start', payload),
    onSuccess: (data, variables) => {
      setRuntimeMessages((prev) => ({ ...prev, [variables.provider]: data.detail }));
      queryClient.invalidateQueries({ queryKey: ['model-runtimes'] });
    },
    onError: (error, variables) => {
      if (variables) {
        setRuntimeMessages((prev) => ({ ...prev, [variables.provider]: error.message }));
      }
    },
  });

  const stopRuntime = useMutation<ModelActionResponse, Error, ModelRuntimePayload>({
    mutationFn: (payload) => postJson<ModelActionResponse>('/api/models/runtimes/stop', payload),
    onSuccess: (data, variables) => {
      setRuntimeMessages((prev) => ({ ...prev, [variables.provider]: data.detail }));
      queryClient.invalidateQueries({ queryKey: ['model-runtimes'] });
    },
    onError: (error, variables) => {
      if (variables) {
        setRuntimeMessages((prev) => ({ ...prev, [variables.provider]: error.message }));
      }
    },
  });

  const uploadRawModel = useMutation<ModelActionResponse, Error, void>({
    mutationFn: async () => {
      if (!uploadFile) {
        throw new Error('Select a model archive to upload.');
      }
      const form = new FormData();
      form.append('provider', uploadProvider);
      form.append('directory_name', uploadDirectory);
      uploadPostprocess.forEach((step) => form.append('postprocess', step));
      form.append('file', uploadFile);
      return postFormData<ModelActionResponse>('/api/models/upload', form);
    },
    onSuccess: (data) => {
      setUploadMessage(data.detail);
    },
    onError: (error) => {
      setUploadMessage(error instanceof Error ? error.message : 'Upload failed');
    },
  });

  const isStarting = (provider: ProviderKey) =>
    startRuntime.isPending && startRuntime.variables?.provider === provider;
  const isStopping = (provider: ProviderKey) =>
    stopRuntime.isPending && stopRuntime.variables?.provider === provider;

  const togglePostprocess = (step: string) => {
    setUploadPostprocess((prev) =>
      prev.includes(step) ? prev.filter((item) => item !== step) : [...prev, step]
    );
  };

  const handleStart = (provider: ProviderKey) => {
    const input = runtimeInputs[provider];
    if (!input.model.trim()) {
      setRuntimeMessages((prev) => ({ ...prev, [provider]: 'Model name is required to start.' }));
      return;
    }
    startRuntime.mutate({
      provider,
      model_name: input.model,
      base_url: input.baseUrl || undefined,
    });
  };

  const handleStop = (provider: ProviderKey) => {
    const input = runtimeInputs[provider];
    if (!input.model.trim()) {
      setRuntimeMessages((prev) => ({ ...prev, [provider]: 'Model name is required to stop.' }));
      return;
    }
    stopRuntime.mutate({
      provider,
      model_name: input.model,
      base_url: input.baseUrl || undefined,
    });
  };

  const shouldRender = backends.length > 0;
  if (!shouldRender) {
    return null;
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="mx-auto w-full max-w-6xl">
        <ProviderCard
          title="Runtime control center"
          icon={<Play className="h-5 w-5 text-nvidia" />}
          description="Start or stop tracked models across your inference backends."
        >
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap justify-center gap-4">
              {runtimeProviders.map(({ key, label, modelPlaceholder, basePlaceholder }) => (
                <div key={key} className="w-full max-w-md flex-1 sm:min-w-[260px] xl:min-w-[280px]">
                  <RuntimeControlRow
                    label={label}
                    input={runtimeInputs[key]}
                    modelPlaceholder={modelPlaceholder}
                    basePlaceholder={basePlaceholder}
                    onChange={(value) =>
                      setRuntimeInputs((prev) => ({
                        ...prev,
                        [key]: value,
                      }))
                    }
                    onStart={() => handleStart(key)}
                    onStop={() => handleStop(key)}
                    isStarting={isStarting(key)}
                    isStopping={isStopping(key)}
                    message={runtimeMessages[key]}
                    runningModels={getRunningModels(key)}
                  />
                </div>
              ))}
            </div>
            {runtimeQuery.isError && (
              <p className="text-xs text-amber-400">
                {runtimeQuery.error instanceof Error
                  ? runtimeQuery.error.message
                  : 'Unable to load runtime status'}
              </p>
            )}
          </div>
        </ProviderCard>
      </div>

      <div className="mx-auto w-full max-w-6xl space-y-6">
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
      </div>

      <div className="mx-auto w-full max-w-6xl">
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

        <ProviderCard
          title="Upload raw model for llama.cpp and vLLM"
          icon={<UploadCloud className="h-5 w-5 text-nvidia" />}
          description="Place model artifacts on the server and optionally trigger helper scripts (quantize, Unsloth, TRT-LLM)."
        >
          <div className="space-y-3 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-slate-300">
                Provider
                <select
                  value={uploadProvider}
                  onChange={(event) => setUploadProvider(event.target.value as ProviderKey)}
                  className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
                >
                  <option value="llamacpp">llama.cpp</option>
                  <option value="vllm">vLLM</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-slate-300">
                Target directory name
                <input
                  value={uploadDirectory}
                  onChange={(event) => setUploadDirectory(event.target.value)}
                  className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
                  placeholder="llama3"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-slate-300">
              Model file (GGUF, safetensors, or archive)
              <input
                type="file"
                onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                className="rounded-md border border-dashed border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { label: 'Quantize (llama.cpp)', value: 'llamacpp_quantize' },
                { label: 'Unsloth optimize', value: 'unsloth_optimize' },
                { label: 'TensorRT-LLM convert', value: 'trt_llm_convert' },
              ].map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={uploadPostprocess.includes(option.value)}
                    onChange={() => togglePostprocess(option.value)}
                    className="h-4 w-4 rounded border border-slate-700 bg-slate-950"
                  />
                  <span className="text-xs sm:text-sm">{option.label}</span>
                </label>
              ))}
            </div>

            <button
              type="button"
              onClick={() => uploadRawModel.mutate()}
              disabled={uploadRawModel.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-nvidia px-3 py-2 font-semibold text-slate-950"
            >
              <UploadCloud className="h-4 w-4" />
              {uploadRawModel.isPending ? 'Uploading…' : 'Upload model'}
            </button>
            {uploadMessage && <p className="text-xs text-amber-400">{uploadMessage}</p>}
          </div>
        </ProviderCard>
      </div>
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

interface RuntimeControlRowProps {
  label: string;
  input: RuntimeInputState;
  modelPlaceholder: string;
  basePlaceholder: string;
  onChange: (value: RuntimeInputState) => void;
  onStart: () => void;
  onStop: () => void;
  isStarting: boolean;
  isStopping: boolean;
  message: string | null;
  runningModels: ModelRuntimeInfo[];
}

function RuntimeControlRow({
  label,
  input,
  modelPlaceholder,
  basePlaceholder,
  onChange,
  onStart,
  onStop,
  isStarting,
  isStopping,
  message,
  runningModels,
}: RuntimeControlRowProps) {
  const runningLabel = runningModels.length
    ? `Running: ${runningModels.map((item) => item.model_name).join(', ')}`
    : 'No tracked models.';

  return (
    <div className="flex h-full flex-col space-y-3 rounded-md border border-slate-800 bg-slate-950/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-slate-300">
          <span className="text-xs text-slate-400">Base URL</span>
          <input
            value={input.baseUrl}
            onChange={(event) => onChange({ ...input, baseUrl: event.target.value })}
            placeholder={basePlaceholder}
            className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-slate-300">
          <span className="text-xs text-slate-400">Model name</span>
          <input
            value={input.model}
            onChange={(event) => onChange({ ...input, model: event.target.value })}
            placeholder={modelPlaceholder}
            className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onStart}
          disabled={isStarting || !input.model.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-nvidia px-3 py-2 font-semibold text-slate-950 disabled:opacity-70"
        >
          <Play className="h-4 w-4" />
          {isStarting ? 'Starting…' : 'Start'}
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={isStopping || !input.model.trim()}
          className="inline-flex items-center gap-2 rounded-md border border-slate-800 px-3 py-2 text-slate-200 disabled:opacity-70"
        >
          <Square className="h-4 w-4" />
          {isStopping ? 'Stopping…' : 'Stop'}
        </button>
      </div>
      <p className="text-xs text-slate-500">{runningLabel}</p>
      {message && <p className="text-xs text-amber-400">{message}</p>}
    </div>
  );
}
