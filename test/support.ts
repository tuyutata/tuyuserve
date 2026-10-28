import type {
  CatalogListingRow, Env, LoginChallengeRow,
  MerchantGrantRow, MerchantInstanceRow, SessionState, TripPostRow, TuyuSignerRow, UserRow,
} from '../src/types';

interface SessionRow extends SessionState { token_hash: string; revoked_at: number | null }

class Statement {
  private values: unknown[] = [];
  constructor(private readonly db: MemoryDb, private readonly sql: string) {}
  bind(...values: unknown[]): Statement { this.values = values; return this }

  async run(): Promise<{ meta: { changes: number } }> {
    if (this.sql.includes('INSERT INTO challenges')) {
      this.db.challenges.set(this.values[0] as string, {
        challenge_id: this.values[0] as string,
        tuyu_id: this.values[1] as string,
        signer_id: this.values[2] as string,
        key_revision: this.values[3] as number,
        account_id: this.values[4] as string,
        product_id: this.values[5] as LoginChallengeRow['product_id'],
        device_id: this.values[6] as string,
        expires_at: this.values[7] as number,
        used_at: null,
      });
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes('UPDATE challenges')) {
      const row = this.db.challenges.get(this.values[1] as string);
      const claimedAt = this.values[8] as number;
      if (row && row.tuyu_id === this.values[2] && row.signer_id === this.values[3]
          && row.key_revision === this.values[4] && row.account_id === this.values[5]
          && row.product_id === this.values[6] && row.device_id === this.values[7]
          && row.used_at === null && row.expires_at > claimedAt) {
        row.used_at = this.values[0] as number;
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }
    if (this.sql.includes('INSERT INTO sessions')) {
      if (this.db.failSessionWrites) throw new Error('fixture_session_write_failed');
      this.db.sessions.set(this.values[0] as string, {
        token_hash: this.values[0] as string,
        tuyu_id: this.values[1] as string,
        signer_id: this.values[2] as string,
        key_revision: this.values[3] as number,
        account_id: this.values[4] as string,
        product_id: this.values[5] as SessionState['product_id'],
        device_id: this.values[6] as string,
        created_at: this.values[7] as number,
        expires_at: this.values[8] as number,
        revoked_at: null,
      });
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes('INSERT INTO instances')) {
      this.db.merchantInstances.set(this.values[0] as string, {
        instance_id: this.values[0] as string,
        owner_id: this.values[1] as string,
        instance_key: this.values[2] as string,
        instance_name: this.values[3] as string,
        merchant_type: this.values[4] as MerchantInstanceRow['merchant_type'],
        service_endpoint: this.values[5] as string | null,
        instance_state: 'active', registered_at: this.values[6] as number,
        updated_at: this.values[7] as number,
      });
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes('INSERT INTO grants')) {
      const key = `${this.values[0]}|${this.values[1]}`;
      this.db.grants.set(key, {
        instance_id: this.values[0] as string,
        admin_id: this.values[1] as string,
        grant_state: 'active',
        issuer_id: this.values[2] as string,
        issuer_signer: this.values[3] as string,
        granted_at: this.values[4] as number, revoked_at: null,
      });
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes("UPDATE grants SET grant_state='revoked'")) {
      const grant = this.db.grants.get(`${this.values[1]}|${this.values[2]}`);
      if (!grant || grant.grant_state !== 'active') return { meta: { changes: 0 } };
      grant.grant_state = 'revoked'; grant.revoked_at = this.values[0] as number;
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes('INSERT INTO listings')) {
      const row: CatalogListingRow = {
        listing_id: this.values[0] as string, instance_id: this.values[1] as string,
        service_kind: this.values[2] as CatalogListingRow['service_kind'],
        listing_title: this.values[3] as string, listing_summary: this.values[4] as string,
        listing_location: this.values[5] as string, instance_key: this.values[6] as string,
        source_time: this.values[7] as number, expires_at: this.values[8] as number,
        signed_payload: this.values[9] as string, payload_signature: this.values[10] as string,
        request_key: this.values[11] as string, listing_state: 'active',
        published_at: this.values[12] as number,
      };
      const existing = this.db.catalogListings.get(row.listing_id);
      if (existing && existing.source_time >= row.source_time) return { meta: { changes: 0 } };
      this.db.catalogListings.set(row.listing_id, row);
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes('INSERT INTO posts')) {
      const row: TripPostRow = {
        trip_id: this.values[0] as string,
        author_id: this.values[1] as string,
        post_title: this.values[2] as string,
        post_body: this.values[3] as string,
        media_keys: this.values[4] as string,
        request_key: this.values[5] as string,
        post_state: 'published',
        created_at: this.values[6] as number,
        updated_at: this.values[7] as number,
      };
      this.db.trips.set(row.trip_id, row);
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes('DELETE FROM sessions WHERE token_hash')) {
      return { meta: { changes: this.db.sessions.delete(this.values[0] as string) ? 1 : 0 } };
    }
    if (this.sql.includes('DELETE FROM sessions WHERE expires_at')) {
      let changes = 0;
      for (const [key, row] of this.db.sessions) {
        if (row.expires_at <= (this.values[0] as number)) {
          this.db.sessions.delete(key); changes += 1;
        }
      }
      return { meta: { changes } };
    }
    return { meta: { changes: 1 } };
  }

  async first<T>(): Promise<T | null> {
    if (this.db.failReads) throw new Error('fixture_database_unavailable');
    if (this.sql.includes('FROM sessions s')) {
      const row = this.db.sessions.get(this.values[0] as string);
      const user = row && this.db.users.get(row.tuyu_id);
      const signer = row && this.db.signers.get(row.signer_id);
      if (!row || row.product_id !== this.values[1] || row.expires_at <= (this.values[2] as number)
          || row.revoked_at !== null || user?.user_state !== 'active'
          || !signer || signer.signer_state !== 'active' || signer.revoked_at !== null
          || signer.tuyu_id !== row.tuyu_id || signer.account_id !== row.account_id
          || signer.key_revision !== row.key_revision || signer.device_id !== row.device_id) return null;
      const { token_hash: _tokenHash, revoked_at: _revokedAt, ...session } = row;
      return session as T;
    }

    if (this.sql.includes('FROM releases')) {
      const tag = this.db.releases.get(`${this.values[0]}:${this.values[1]}`);
      return tag === undefined ? null : { version_tag: tag } as T;
    }
    if (this.sql.includes('FROM users WHERE tuyu_id')) {
      return (this.db.users.get(this.values[0] as string) as T | undefined) ?? null;
    }
    if (this.sql.includes("FROM signers\n      WHERE tuyu_id")) {
      const signer = [...this.db.signers.values()].find((item) =>
        item.tuyu_id === this.values[0] && item.account_id === this.values[1] && item.signer_state === 'active');
      return (signer as T | undefined) ?? null;
    }
    if (this.sql.includes('FROM signers WHERE account_id')) {
      const signer = [...this.db.signers.values()].find((item) => item.account_id === this.values[0]);
      return (signer as T | undefined) ?? null;
    }
    if (this.sql.includes('FROM challenges')) {
      return (this.db.challenges.get(this.values[0] as string) as T | undefined) ?? null;
    }
    if (this.sql.includes('FROM instances WHERE instance_id')) {
      return (this.db.merchantInstances.get(this.values[0] as string) as T | undefined) ?? null;
    }
    if (this.sql.includes('SELECT admin_id FROM grants')) {
      const grant = this.db.grants.get(`${this.values[0]}|${this.values[1]}`);
      return (grant?.grant_state === 'active' ? { admin_id: grant.admin_id } as T : null);
    }
    if (this.sql.includes('FROM listings WHERE request_key')) {
      const row = [...this.db.catalogListings.values()].find(
        (item) => item.request_key === this.values[0],
      );
      return (row as T | undefined) ?? null;
    }
    if (this.sql.includes('FROM listings WHERE listing_id')) {
      const row = this.db.catalogListings.get(this.values[0] as string);
      return (row && row.listing_state === 'active' && row.expires_at > (this.values[1] as number)
        ? row as T : null);
    }
    if (this.sql.includes('FROM posts WHERE author_id')) {
      const row = [...this.db.trips.values()].find((item) =>
        item.author_id === this.values[0] && item.request_key === this.values[1]);
      return (row as T | undefined) ?? null;
    }
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    if (this.sql.includes('FROM listings')) {
      const now = this.values[0] as number;
      const serviceKind = this.values.length === 7 ? this.values[1] : null;
      const query = this.values[serviceKind === null ? 1 : 2] as string;
      const limit = this.values.at(-1) as number;
      const rows = [...this.db.catalogListings.values()]
        .filter((item) => item.listing_state === 'active' && item.expires_at > now)
        .filter((item) => serviceKind === null || item.service_kind === serviceKind)
        .filter((item) => query === '' || `${item.listing_title} ${item.listing_summary} ${item.listing_location}`.includes(query))
        .sort((left, right) => right.source_time - left.source_time)
        .slice(0, limit);
      return { results: rows as T[] };
    }
    if (this.sql.includes('FROM posts')) {
      const rows = [...this.db.trips.values()]
        .filter((item) => item.post_state === 'published')
        .sort((left, right) => right.created_at - left.created_at)
        .slice(0, this.values[0] as number);
      return { results: rows as T[] };
    }
    return { results: [] };
  }
}

export class MemoryDb {
  failReads = false;
  failSessionWrites = false;
  readonly releases = new Map<string, string>();
  readonly users = new Map<string, UserRow>();
  readonly signers = new Map<string, TuyuSignerRow>();
  readonly merchantInstances = new Map<string, MerchantInstanceRow>();
  readonly grants = new Map<string, MerchantGrantRow>();
  readonly challenges = new Map<string, LoginChallengeRow>();
  readonly sessions = new Map<string, SessionRow>();
  readonly catalogListings = new Map<string, CatalogListingRow>();
  readonly trips = new Map<string, TripPostRow>();
  prepare(sql: string): Statement { return new Statement(this, sql) }
}

export class MemoryKv {
  readonly values = new Map<string, string>();
  async get<T>(key: string, type?: 'json'): Promise<T | string | null> {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === 'json' ? JSON.parse(value) as T : value;
  }
  async put(key: string, value: string): Promise<void> { this.values.set(key, value) }
  async delete(key: string): Promise<void> { this.values.delete(key) }
}

export class MemoryR2 {
  async head(): Promise<R2Object | null> { return null }
  async get(): Promise<R2ObjectBody | null> { return null }
}

export function createTestEnv(): { db: MemoryDb; kv: MemoryKv; env: Env } {
  const db = new MemoryDb(); const kv = new MemoryKv(); const r2 = new MemoryR2();
  return { db, kv, env: {
    DB: db as unknown as D1Database,
    SESSION_CACHE: kv as unknown as KVNamespace,
    DOWNLOADS: r2 as unknown as R2Bucket,
    CHALLENGE_TTL_SECONDS: '300', SESSION_TTL_SECONDS: '28800',
  } };
}

export function request(path: string, body: unknown, token?: string): Request {
  return new Request(`https://worker.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}
export async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return response.json<Record<string, unknown>>();
}

// 中文注释：显式准备认证主体；写入会话不会凭空创建用户或签名绑定。
export function seedIdentity(db: MemoryDb, session: SessionState): void {
  db.users.set(session.tuyu_id, {
    tuyu_id: session.tuyu_id, user_state: 'active', created_at: 1, updated_at: 1,
  });
  db.signers.set(session.signer_id, {
    signer_id: session.signer_id, tuyu_id: session.tuyu_id, account_id: session.account_id,
    key_revision: session.key_revision, device_id: session.device_id, signer_state: 'active',
    bound_at: 1, revoked_at: null, updated_at: 1,
  });
}
