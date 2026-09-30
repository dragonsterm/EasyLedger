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
const TOKEN_KEY = 'easyledger_auth_token';

export function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // LocalStorage access may fail in restricted environments
  }
}

export function clearAuthToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // LocalStorage access may fail
  }
}

export function apiUrl(path: string): string {
  if (!path.startsWith('/')) throw new Error('API paths must start with /.');
  return apiBase ? new URL(path, apiBase).toString() : path;
}

export function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  const token = getAuthToken();
  if (token && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${token}`);
  }
  return fetch(apiUrl(path), { ...options, headers, credentials: 'include' });
}
