import { ChangeEvent, FormEvent, InputHTMLAttributes, useMemo, useState } from 'react';
import { GaugeCircle, Play, SlidersHorizontal } from 'lucide-react';

export interface BackendMetadata {
  name: string;
  provider: string;
  default_base_url: string;
  description: string;
  parameters: Record<string, string>;
}

export interface BenchmarkParameters {
  request_count: number;
  concurrency: number;
  warmup_requests: number;
  max_tokens: number;
  temperature: number;
  top_p: number;
  repetition_penalty: number;
  stream: boolean;
  timeout: number;
}

export interface BackendParameters {
  nim_model_name?: string | null;
  ollama_keep_alive?: string | null;
  vllm_best_of?: number | null;
  vllm_use_beam_search?: boolean | null;
}

export interface BenchmarkMetadata {
  quantization?: 'none' | 'nvfp4' | 'fp8' | 'int8';
  enable_trt_llm?: boolean;
}

export interface BenchmarkFormState {
  provider: string;
  model_name: string;
  base_url?: string;
  prompt: string;
  use_random_prompts: boolean;
  random_prompt_count: number;
  parameters: BenchmarkParameters;
  backend_parameters: BackendParameters;
  metadata: BenchmarkMetadata;
}

interface Props {
  backends: BackendMetadata[];
  isSubmitting: boolean;
  onSubmit: (payload: BenchmarkFormState) => void;
}

const DEFAULT_PROMPT =
  'Summarize the importance of TensorRT-LLM when deploying large language models in production environments.';

export function BenchmarkForm({ backends, isSubmitting, onSubmit }: Props) {
  const [formState, setFormState] = useState<BenchmarkFormState>(() => ({
    provider: backends[0]?.provider ?? 'ollama',
    model_name: 'llama2',
    prompt: DEFAULT_PROMPT,
    use_random_prompts: false,
    random_prompt_count: 5,
    parameters: {
      request_count: 10,
      concurrency: 2,
      warmup_requests: 2,
      max_tokens: 256,
      temperature: 0.2,
      top_p: 0.9,
      repetition_penalty: 1.0,
      stream: true,
      timeout: 120,
    },
    backend_parameters: {},
    metadata: {
      quantization: 'none',
      enable_trt_llm: false,
    },
  }));

  const providerMeta = useMemo(
    () => backends.find((backend) => backend.provider === formState.provider),
    [backends, formState.provider]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(formState);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-6"
    >
      <header className="flex items-center gap-2 text-slate-200">
        <GaugeCircle className="h-5 w-5 text-nvidia" />
        <h2 className="text-lg font-semibold">Benchmark parameters</h2>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-slate-300">
          Provider
          <select
            value={formState.provider}
            onChange={(event) =>
              setFormState((prev) => ({
                ...prev,
                provider: event.target.value,
                base_url: undefined,
              }))
            }
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          >
            {backends.map((backend) => (
              <option key={backend.provider} value={backend.provider}>
                {backend.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-300">
          Model name
          <input
            type="text"
            value={formState.model_name}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, model_name: event.target.value }))
            }
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            placeholder="Meta-Llama-3-8B"
            required
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-300">
          Base URL (optional)
          <input
            type="url"
            value={formState.base_url ?? ''}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, base_url: event.target.value || undefined }))
            }
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            placeholder={providerMeta?.default_base_url ?? 'http://localhost:8000'}
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-300">
          Prompt
          <textarea
            value={formState.prompt}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, prompt: event.target.value }))
            }
            className="min-h-[120px] rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          />
        </label>

        <div className="md:col-span-2 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <input
              type="checkbox"
              checked={formState.use_random_prompts}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  use_random_prompts: event.target.checked,
                }))
              }
              className="h-4 w-4 rounded border border-slate-700 bg-slate-950"
            />
            Generate random prompts with the model
          </label>
          <p className="mt-2 text-xs text-slate-400">
            We will ask the selected model to create additional prompts before benchmarking to reduce repeated
            completions.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              Random prompt count
              <input
                type="number"
                min={1}
                max={100}
                value={formState.random_prompt_count}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    random_prompt_count: Number(event.target.value) || 1,
                  }))
                }
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                disabled={!formState.use_random_prompts}
              />
            </label>
          </div>
        </div>
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
        <header className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-slate-200">Runtime profile</span>
          <p className="text-xs text-slate-400">
            Quickly align precision and pipeline choices. Select NVFP4 for automatic TensorRT-LLM enablement.
          </p>
        </header>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="flex flex-wrap gap-2">
            {(() => {
              const quantization = formState.metadata.quantization ?? 'none';
              return (
                [
                  { label: 'Default precision', value: 'none' },
                  { label: 'NVFP4 (TensorRT-LLM)', value: 'nvfp4' },
                  { label: 'FP8', value: 'fp8' },
                  { label: 'INT8', value: 'int8' },
                ] as const
              ).map((option) => {
                const isActive = quantization === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setFormState((prev) => ({
                        ...prev,
                        metadata: {
                          ...prev.metadata,
                          quantization: option.value,
                          enable_trt_llm:
                            option.value === 'nvfp4' ? true : Boolean(prev.metadata.enable_trt_llm),
                        },
                      }))
                    }
                    className={`rounded-md border px-3 py-2 text-sm transition ${
                      isActive
                        ? 'border-lime-400 bg-lime-400/10 text-lime-200'
                        : 'border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              });
            })()}
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={Boolean(formState.metadata.enable_trt_llm)}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    metadata: {
                      ...prev.metadata,
                      enable_trt_llm: event.target.checked,
                      quantization:
                        event.target.checked && prev.metadata.quantization === 'none'
                          ? 'nvfp4'
                          : prev.metadata.quantization,
                    },
                  }))
                }
                className="h-4 w-4 rounded border border-slate-700 bg-slate-950"
              />
              Enable TensorRT-LLM pipeline (auto NVFP4 when needed)
            </label>
            <div className="flex flex-wrap gap-2 text-xs text-slate-400">
              <QuickPresetButton
                label="Smoke test"
                description="5 req, 1 concurrency"
                onClick={() =>
                  applyPreset({ request_count: 5, concurrency: 1, warmup_requests: 0, max_tokens: 128 })
                }
              />
              <QuickPresetButton
                label="Latency focus"
                description="10 req, 2 concurrency"
                onClick={() =>
                  applyPreset({ request_count: 10, concurrency: 2, warmup_requests: 1, max_tokens: 256 })
                }
              />
              <QuickPresetButton
                label="Throughput soak"
                description="50 req, 8 concurrency"
                onClick={() =>
                  applyPreset({ request_count: 50, concurrency: 8, warmup_requests: 4, max_tokens: 512 })
                }
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <NumberField
          label="Requests"
          value={formState.parameters.request_count}
          min={1}
          onChange={(value) => updateParameters('request_count', value)}
        />
        <NumberField
          label="Concurrency"
          value={formState.parameters.concurrency}
          min={1}
          max={256}
          onChange={(value) => updateParameters('concurrency', value)}
        />
        <NumberField
          label="Warmup"
          value={formState.parameters.warmup_requests}
          min={0}
          max={32}
          onChange={(value) => updateParameters('warmup_requests', value)}
        />
        <NumberField
          label="Max tokens"
          value={formState.parameters.max_tokens}
          min={16}
          step={16}
          onChange={(value) => updateParameters('max_tokens', value)}
        />
        <NumberField
          label="Temperature"
          value={formState.parameters.temperature}
          step={0.05}
          min={0}
          max={2}
          onChange={(value) => updateParameters('temperature', value)}
        />
        <NumberField
          label="Top P"
          value={formState.parameters.top_p}
          step={0.05}
          min={0}
          max={1}
          onChange={(value) => updateParameters('top_p', value)}
        />
      </section>

      <details className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-300">
          <SlidersHorizontal className="h-4 w-4 text-nvidia" />
          Advanced backend knobs
        </summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={formState.parameters.stream}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  parameters: {
                    ...prev.parameters,
                    stream: event.target.checked,
                  },
                }))
              }
              className="h-4 w-4 rounded border border-slate-700 bg-slate-950"
            />
            Enable streaming responses
          </label>

          {formState.provider === 'nim' && (
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              Deployed NIM model name
              <input
                type="text"
                value={formState.backend_parameters.nim_model_name ?? ''}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    backend_parameters: {
                      ...prev.backend_parameters,
                      nim_model_name: event.target.value || undefined,
                    },
                  }))
                }
                placeholder="nemotron-3-8b-instruct"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </label>
          )}

          {formState.provider === 'ollama' && (
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              Keep alive duration
              <input
                type="text"
                value={formState.backend_parameters.ollama_keep_alive ?? ''}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    backend_parameters: {
                      ...prev.backend_parameters,
                      ollama_keep_alive: event.target.value || undefined,
                    },
                  }))
                }
                placeholder="10m"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </label>
          )}

          {formState.provider === 'vllm' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-slate-300">
                Best of
                <input
                  type="number"
                  min={1}
                  value={formState.backend_parameters.vllm_best_of ?? 1}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      backend_parameters: {
                        ...prev.backend_parameters,
                        vllm_best_of: Number(event.target.value),
                      },
                    }))
                  }
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={Boolean(formState.backend_parameters.vllm_use_beam_search)}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      backend_parameters: {
                        ...prev.backend_parameters,
                        vllm_use_beam_search: event.target.checked,
                      },
                    }))
                  }
                  className="h-4 w-4 rounded border border-slate-700 bg-slate-950"
                />
                Enable beam search
              </label>
            </div>
          )}
        </div>
      </details>

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-nvidia px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-lime-500 disabled:opacity-70"
      >
        <Play className="h-4 w-4" />
        {isSubmitting ? 'Running benchmark…' : 'Start benchmark'}
      </button>
    </form>
  );

  function updateParameters<Key extends keyof BenchmarkParameters>(key: Key, value: number) {
    setFormState((prev) => ({
      ...prev,
      parameters: {
        ...prev.parameters,
        [key]: value,
      },
    }));
  }

  function applyPreset(overrides: Partial<BenchmarkParameters>) {
    setFormState((prev) => ({
      ...prev,
      parameters: {
        ...prev.parameters,
        ...overrides,
      },
    }));
  }
}

interface NumberFieldProps
  extends Pick<InputHTMLAttributes<HTMLInputElement>, 'min' | 'max' | 'step'> {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function NumberField({ label, value, onChange, min, max, step }: NumberFieldProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value: rawValue } = event.target;
    const numericValue = rawValue === '' ? Number.NaN : Number(rawValue);
    onChange(Number.isNaN(numericValue) ? 0 : numericValue);
  };

  return (
    <label className="flex flex-col gap-2 text-sm text-slate-300">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={handleChange}
        className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
      />
    </label>
  );
}

interface QuickPresetButtonProps {
  label: string;
  description: string;
  onClick: () => void;
}

function QuickPresetButton({ label, description, onClick }: QuickPresetButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-left text-slate-200 transition hover:border-lime-400 hover:text-lime-200"
    >
      <p className="text-xs font-semibold">{label}</p>
      <p className="text-[11px] text-slate-400">{description}</p>
    </button>
  );
}

