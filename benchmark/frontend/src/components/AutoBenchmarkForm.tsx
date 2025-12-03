import { ChangeEvent, FormEvent, InputHTMLAttributes, useMemo, useState } from 'react';
import { Radar, Sparkles, Wand2 } from 'lucide-react';

import type {
  BackendMetadata,
  BackendParameters,
  BenchmarkParameters,
} from './BenchmarkForm';

export interface AutoBenchmarkPayload {
  provider: string;
  model_name: string;
  prompt: string;
  base_url?: string;
  sweep_concurrency: number[];
  sweep_max_tokens: number[];
  sweep_temperature: number[];
  parameters: BenchmarkParameters;
  backend_parameters: BackendParameters;
}

interface Props {
  backends: BackendMetadata[];
  isSubmitting: boolean;
  onSubmit: (payload: AutoBenchmarkPayload) => void;
}

const DEFAULT_PROMPT =
  'Write a concise blog outline about accelerating generative AI workloads with TensorRT-LLM.';

export function AutoBenchmarkForm({ backends, isSubmitting, onSubmit }: Props) {
  const [formState, setFormState] = useState({
    provider: backends[0]?.provider ?? 'nim',
    model_name: 'Meta-Llama-3-8B-Instruct',
    prompt: DEFAULT_PROMPT,
    base_url: '',
    sweep_concurrency: '1,4,8',
    sweep_max_tokens: '128,256,512',
    sweep_temperature: '0.1,0.3,0.5',
    parameters: {
      request_count: 10,
      concurrency: 1,
      warmup_requests: 1,
      max_tokens: 256,
      temperature: 0.2,
      top_p: 0.9,
      repetition_penalty: 1.0,
      stream: true,
      timeout: 120,
    } as BenchmarkParameters,
    backend_parameters: {} as BackendParameters,
  });

  const providerMeta = useMemo(
    () => backends.find((backend) => backend.provider === formState.provider),
    [backends, formState.provider]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload: AutoBenchmarkPayload = {
      provider: formState.provider,
      model_name: formState.model_name,
      prompt: formState.prompt,
      base_url: formState.base_url || undefined,
      sweep_concurrency: parseNumberList(formState.sweep_concurrency),
      sweep_max_tokens: parseNumberList(formState.sweep_max_tokens),
      sweep_temperature: parseNumberList(formState.sweep_temperature),
      parameters: formState.parameters,
      backend_parameters: formState.backend_parameters,
    };

    onSubmit(payload);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg"
    >
      <header className="flex items-center gap-2 text-slate-200">
        <Radar className="h-5 w-5 text-nvidia" />
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Auto sweeps</p>
          <h2 className="text-lg font-semibold">Explore throughput and latency quickly</h2>
        </div>
      </header>

      <p className="mt-2 text-sm text-slate-400">
        Run structured sweeps over concurrency, token budgets, and temperature without juggling CLI flags.
        Configure your base request once and the dashboard will orchestrate the full matrix for you.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <SelectField
          label="Provider"
          value={formState.provider}
          onChange={(value) =>
            setFormState((prev) => ({
              ...prev,
              provider: value,
              base_url: '',
            }))
          }
          options={backends.map((backend) => ({
            label: backend.name,
            value: backend.provider,
          }))}
        />

        <TextField
          label="Model name"
          value={formState.model_name}
          onChange={(value) => setFormState((prev) => ({ ...prev, model_name: value }))}
          placeholder="Meta-Llama-3-8B-Instruct"
          required
        />

        <TextField
          label="Base URL (optional)"
          value={formState.base_url}
          onChange={(value) => setFormState((prev) => ({ ...prev, base_url: value }))}
          placeholder={providerMeta?.default_base_url ?? 'http://localhost:8000'}
          type="url"
        />

        <TextAreaField
          label="Prompt"
          value={formState.prompt}
          onChange={(value) => setFormState((prev) => ({ ...prev, prompt: value }))}
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <TextField
          label="Concurrency sweep"
          value={formState.sweep_concurrency}
          onChange={(value) => setFormState((prev) => ({ ...prev, sweep_concurrency: value }))}
          helper="Comma-separated values (e.g. 1,4,8)"
        />
        <TextField
          label="Max tokens sweep"
          value={formState.sweep_max_tokens}
          onChange={(value) => setFormState((prev) => ({ ...prev, sweep_max_tokens: value }))}
          helper="Comma-separated values (e.g. 128,256,512)"
        />
        <TextField
          label="Temperature sweep"
          value={formState.sweep_temperature}
          onChange={(value) => setFormState((prev) => ({ ...prev, sweep_temperature: value }))}
          helper="Comma-separated values (e.g. 0.1,0.3,0.5)"
        />
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <NumberField
          label="Requests"
          value={formState.parameters.request_count}
          min={1}
          onChange={(value) => updateParameters('request_count', value)}
        />
        <NumberField
          label="Warmup"
          value={formState.parameters.warmup_requests}
          min={0}
          max={64}
          onChange={(value) => updateParameters('warmup_requests', value)}
        />
        <NumberField
          label="Timeout (s)"
          value={formState.parameters.timeout}
          min={10}
          max={600}
          step={10}
          onChange={(value) => updateParameters('timeout', value)}
        />
        <NumberField
          label="Temperature"
          value={formState.parameters.temperature}
          min={0}
          max={2}
          step={0.05}
          onChange={(value) => updateParameters('temperature', value)}
        />
        <NumberField
          label="Top P"
          value={formState.parameters.top_p}
          min={0}
          max={1}
          step={0.05}
          onChange={(value) => updateParameters('top_p', value)}
        />
        <NumberField
          label="Repetition penalty"
          value={formState.parameters.repetition_penalty}
          min={0}
          step={0.1}
          onChange={(value) => updateParameters('repetition_penalty', value)}
        />
      </section>

      <details className="mt-6 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-300">
          <Wand2 className="h-4 w-4 text-nvidia" />
          Backend-specific options
        </summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={formState.parameters.stream}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  parameters: { ...prev.parameters, stream: event.target.checked },
                }))
              }
              className="h-4 w-4 rounded border border-slate-700 bg-slate-950"
            />
            Enable streaming responses
          </label>

          {formState.provider === 'nim' && (
            <TextField
              label="Deployed NIM model"
              value={formState.backend_parameters.nim_model_name ?? ''}
              onChange={(value) =>
                setFormState((prev) => ({
                  ...prev,
                  backend_parameters: {
                    ...prev.backend_parameters,
                    nim_model_name: value || undefined,
                  },
                }))
              }
              placeholder="nemotron-3-8b-instruct"
            />
          )}

          {formState.provider === 'ollama' && (
            <TextField
              label="Keep alive duration"
              value={formState.backend_parameters.ollama_keep_alive ?? ''}
              onChange={(value) =>
                setFormState((prev) => ({
                  ...prev,
                  backend_parameters: {
                    ...prev.backend_parameters,
                    ollama_keep_alive: value || undefined,
                  },
                }))
              }
              placeholder="10m"
            />
          )}

          {formState.provider === 'vllm' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Best of"
                value={formState.backend_parameters.vllm_best_of ?? 1}
                min={1}
                onChange={(value) =>
                  setFormState((prev) => ({
                    ...prev,
                    backend_parameters: {
                      ...prev.backend_parameters,
                      vllm_best_of: value,
                    },
                  }))
                }
              />
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
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-nvidia to-lime-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-md transition hover:from-lime-400 hover:to-nvidia disabled:opacity-70"
      >
        <Sparkles className="h-4 w-4" />
        {isSubmitting ? 'Running sweep…' : 'Launch auto benchmark'}
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

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
}

function SelectField({ label, value, onChange, options }: SelectFieldProps) {
  return (
    <label className="flex flex-col gap-2 text-sm text-slate-300">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface TextFieldProps extends Pick<InputHTMLAttributes<HTMLInputElement>, 'type' | 'required' | 'placeholder'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
}

function TextField({ label, value, onChange, helper, type = 'text', ...rest }: TextFieldProps) {
  return (
    <label className="flex flex-col gap-2 text-sm text-slate-300">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
        {...rest}
      />
      {helper && <span className="text-xs text-slate-500">{helper}</span>}
    </label>
  );
}

interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function TextAreaField({ label, value, onChange }: TextAreaFieldProps) {
  return (
    <label className="flex flex-col gap-2 text-sm text-slate-300">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[120px] rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
      />
    </label>
  );
}

interface NumberFieldProps extends Pick<InputHTMLAttributes<HTMLInputElement>, 'min' | 'max' | 'step'> {
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

function parseNumberList(value: string): number[] {
  const parts = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((num) => Number.isFinite(num) && num > 0);

  return parts.length > 0 ? parts : [1];
}

