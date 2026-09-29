type ApiBuildEnvironment = {
  VITE_API_BASE_URL?: string;
  VITE_API_HOSTNAME?: string;
};

const buildEnvironment = (import.meta as unknown as { env?: ApiBuildEnvironment }).env ?? {};

function configuredApiBase(): string | null {
  const baseUrl = buildEnvironment.VITE_API_BASE_URL?.trim();
  const hostname = buildEnvironment.VITE_API_HOSTNAME?.trim();
  const raw = baseUrl || (hostname ? `https://${hostname}` : '');
  if (!raw) return null;
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('VITE_API_BASE_URL must use HTTP or HTTPS.');
  }
  return parsed.origin;
}

const apiBase = configuredApiBase();

export function apiUrl(path: string): string {
  if (!path.startsWith('/')) throw new Error('API paths must start with /.');
  return apiBase ? new URL(path, apiBase).toString() : path;
}

export function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), { ...options, credentials: 'include' });
}
