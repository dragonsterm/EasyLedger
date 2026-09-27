import type { AuthenticationAdapter } from './app.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface LocalDemoAuthOptions {
  environment: string | undefined;
  enabled: boolean;
  userId: string | undefined;
}

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1';
}

function isLocalHost(host: string | undefined): boolean {
  if (!host) return false;
  try {
    const hostname = new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

/**
 * Explicit local-only demo identity. It is disabled unless NODE_ENV is exactly
 * development and the operator opts in with a configured demo owner UUID.
 * The API socket and Host header must both be loopback/local, so a Vite proxy
 * works while a LAN or deployed request cannot inherit the demo identity.
 */
export function createLocalDemoAuthAdapter(options: LocalDemoAuthOptions): AuthenticationAdapter | undefined {
  const userId = options.userId?.trim();
  if (options.environment !== 'development' || !options.enabled || !userId || !UUID.test(userId)) {
    return undefined;
  }

  return (request) => {
    const input = request as {
      raw?: { socket?: { remoteAddress?: string } };
      headers?: Record<string, string | string[] | undefined>;
    };
    const hostHeader = input.headers?.host;
    const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
    if (!isLoopback(input.raw?.socket?.remoteAddress) || !isLocalHost(host)) return null;
    return { userId };
  };
}
