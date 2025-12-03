const rawApiBase = import.meta.env.VITE_API_BASE;
export const API_BASE = typeof rawApiBase === 'string' ? rawApiBase.trim() : '';

function buildUrl(path: string): string {
  if (!API_BASE) {
    return path;
  }

  try {
    const base = API_BASE.startsWith('http')
      ? new URL(API_BASE)
      : new URL(API_BASE, window.location.origin);
    return new URL(path, base).toString();
  } catch (error) {
    console.error('Invalid API base URL configuration', error);
    return path;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), init);
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
