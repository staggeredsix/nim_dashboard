export const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorPayload.detail ?? 'Request failed');
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function getJson<T>(path: string): Promise<T> {
  return requestJson<T>(path);
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
