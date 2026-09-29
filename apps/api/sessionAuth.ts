import { createHash, randomBytes } from 'node:crypto';
import type { DatabasePool } from '../../packages/domain/mutations.ts';

export interface MerchantSession {
  token: string;
  userId: string;
  businessId: string;
  createdAt: number;
  expiresAt: number;
}

interface StoredSessionRow {
  user_id: string;
  business_id: string;
  created_at: Date | string;
  expires_at: Date | string;
}

function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function timestamp(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export class SessionAuthService {
  private readonly pool: DatabasePool & { query?: unknown };
  private readonly sessionTtlMs: number;

  constructor(
    pool: DatabasePool & { query?: unknown },
    sessionTtlMs = 7 * 24 * 60 * 60 * 1000,
  ) {
    this.pool = pool;
    this.sessionTtlMs = sessionTtlMs;
  }

  async createSession(options: {
    userId: string;
    businessId: string;
    ttlMs?: number;
  }, executor: { query?: unknown } = this.pool): Promise<MerchantSession> {
    const token = `eld_${randomBytes(32).toString('base64url')}`;
    const now = Date.now();
    const expiresAt = now + (options.ttlMs ?? this.sessionTtlMs);
    if (typeof executor?.query !== 'function') throw new Error('Session storage requires a PostgreSQL query executor');
    await (executor.query as (query: string, values: unknown[]) => Promise<unknown>)(
      `INSERT INTO auth_sessions (token_hash, user_id, business_id, created_at, expires_at)
       VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), to_timestamp($5 / 1000.0))`,
      [digestToken(token), options.userId, options.businessId, now, expiresAt],
    );
    return { token, userId: options.userId, businessId: options.businessId, createdAt: now, expiresAt };
  }

  async getSession(token: string): Promise<MerchantSession | null> {
    if (!token || typeof token !== 'string') return null;
    if (typeof this.pool?.query !== 'function') throw new Error('Session storage requires a PostgreSQL query executor');
    const result = await (this.pool.query as (query: string, values: unknown[]) => Promise<{ rows: StoredSessionRow[] }>)(
      `SELECT user_id::text, business_id::text, created_at, expires_at
         FROM auth_sessions
        WHERE token_hash = $1 AND expires_at > now()
        LIMIT 1`,
      [digestToken(token.trim())],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      token: token.trim(),
      userId: row.user_id,
      businessId: row.business_id,
      createdAt: timestamp(row.created_at),
      expiresAt: timestamp(row.expires_at),
    };
  }

  async validateSession(token: string): Promise<MerchantSession | null> {
    return this.getSession(token);
  }

  async revokeSession(token: string): Promise<boolean> {
    if (!token || typeof token !== 'string') return false;
    if (typeof this.pool?.query !== 'function') throw new Error('Session storage requires a PostgreSQL query executor');
    const result = await (this.pool.query as (query: string, values: unknown[]) => Promise<{ rowCount: number | null }>)(
      'DELETE FROM auth_sessions WHERE token_hash = $1',
      [digestToken(token.trim())],
    );
    return (result.rowCount ?? 0) > 0;
  }

  extractTokenFromRequest(request: unknown): string | null {
    if (!request || typeof request !== 'object') return null;
    const req = request as {
      headers?: Record<string, string | string[] | undefined>;
      query?: Record<string, unknown>;
    };
    const headers = req.headers ?? {};

    const auth = headers.authorization;
    const authVal = Array.isArray(auth) ? auth[0] : auth;
    if (authVal && typeof authVal === 'string' && authVal.startsWith('Bearer ')) {
      const extracted = authVal.slice(7).trim();
      if (extracted) return extracted;
    }

    const cookieHeader = headers.cookie;
    const cookieVal = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
    if (typeof cookieVal === 'string') {
      const match = cookieVal.match(/(?:^|;\s*)easyledger_session=([^;]+)/);
      if (match) {
        try { return decodeURIComponent(match[1].trim()); } catch { return null; }
      }
    }
    return null;
  }
}
