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

export interface BenchmarkFormState {
  provider: string;
  model_name: string;
  base_url?: string;
  prompt: string;
  parameters: BenchmarkParameters;
  backend_parameters: BackendParameters;
}

interface Props {
  backends: BackendMetadata[];
  isSubmitting: boolean;
  onSubmit: (payload: BenchmarkFormState) => void;
}

const DEFAULT_PROMPT =
  'Summarise the importance of TensorRT-LLM when deploying large language models in production environments.';

export function BenchmarkForm({ backends, isSubmitting, onSubmit }: Props) {
  const [formState, setFormState] = useState<BenchmarkFormState>(() => ({
    provider: backends[0]?.provider ?? 'ollama',
    model_name: 'llama2',
    prompt: DEFAULT_PROMPT,
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
      </div>

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

