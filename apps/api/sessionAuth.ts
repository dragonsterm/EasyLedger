import { randomBytes } from 'node:crypto';
import type { AuthenticationAdapter } from './app.ts';

export interface MerchantSession {
  token: string;
  userId: string;
  businessId?: string;
  businessName?: string;
  isDemo?: boolean;
  currency?: 'IDR' | 'USD';
  createdAt: number;
  expiresAt: number;
}

export class SessionAuthService {
  private readonly sessions = new Map<string, MerchantSession>();
  private readonly sessionTtlMs: number;

  constructor(sessionTtlMs = 7 * 24 * 60 * 60 * 1000) {
    this.sessionTtlMs = sessionTtlMs;
  }

  createSession(options: {
    userId: string;
    businessId?: string;
    businessName?: string;
    isDemo?: boolean;
    currency?: 'IDR' | 'USD';
    ttlMs?: number;
  }): MerchantSession {
    const token = `eld_${randomBytes(24).toString('hex')}`;
    const now = Date.now();
    const session: MerchantSession = {
      token,
      userId: options.userId,
      businessId: options.businessId,
      businessName: options.businessName,
      isDemo: options.isDemo,
      currency: options.currency,
      createdAt: now,
      expiresAt: now + (options.ttlMs ?? this.sessionTtlMs),
    };
    this.sessions.set(token, session);
    return session;
  }

  getSession(token: string): MerchantSession | null {
    if (!token || typeof token !== 'string') return null;
    const session = this.sessions.get(token.trim());
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token.trim());
      return null;
    }
    return session;
  }

  revokeSession(token: string): boolean {
    if (!token || typeof token !== 'string') return false;
    return this.sessions.delete(token.trim());
  }

  clear(): void {
    this.sessions.clear();
  }

  extractTokenFromRequest(request: unknown): string | null {
    if (!request || typeof request !== 'object') return null;
    const req = request as {
      headers?: Record<string, string | string[] | undefined>;
      query?: Record<string, unknown>;
    };
    const headers = req.headers ?? {};

    // 1. Authorization: Bearer <token>
    const auth = headers.authorization;
    const authVal = Array.isArray(auth) ? auth[0] : auth;
    if (authVal && typeof authVal === 'string' && authVal.startsWith('Bearer ')) {
      const extracted = authVal.slice(7).trim();
      if (extracted) return extracted;
    }

    // 2. Custom headers
    const custom = headers['x-session-token'] ?? headers['x-easyledger-session'];
    const customVal = Array.isArray(custom) ? custom[0] : custom;
    if (typeof customVal === 'string' && customVal.trim()) {
      return customVal.trim();
    }

    // 3. Cookie: easyledger_session=<token>
    const cookieHeader = headers.cookie;
    const cookieVal = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
    if (typeof cookieVal === 'string') {
      const match = cookieVal.match(/(?:^|;\s*)easyledger_session=([^;]+)/);
      if (match) {
        return decodeURIComponent(match[1].trim());
      }
    }

    return null;
  }

  createAuthenticationAdapter(fallbackAdapter?: AuthenticationAdapter): AuthenticationAdapter {
    return async (request: unknown) => {
      const token = this.extractTokenFromRequest(request);
      if (token) {
        const session = this.getSession(token);
        if (session) {
          return { userId: session.userId };
        }
      }

      if (fallbackAdapter) {
        return typeof fallbackAdapter === 'function'
          ? fallbackAdapter(request)
          : fallbackAdapter.authenticate(request);
      }

      return null;
    };
  }
}
