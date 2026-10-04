import type {
  CatalogListingRow, ChatConversationRow, ChatMessageRow, Env, LoginChallengeRow,
  MerchantGrantRow, MerchantInstanceRow, SessionState, TripPostRow, TuyuSignerRow, UserRow,
} from '../src/types';

interface SessionIndexRow extends SessionState { session_token_hash: string }

class Statement {
  private values: unknown[] = [];
  constructor(private readonly db: MemoryDb, private readonly sql: string) {}
  bind(...values: unknown[]): Statement { this.values = values; return this }

  async run(): Promise<{ meta: { changes: number } }> {
    if (this.sql.includes('INSERT INTO login_challenges')) {
      this.db.challenges.set(this.values[0] as string, {
        challenge_id: this.values[0] as string,
        tuyu_id: this.values[1] as string,
        signer_id: this.values[2] as string,
        key_revision: this.values[3] as number,
        account_id: this.values[4] as string,
        audience: this.values[5] as LoginChallengeRow['audience'],
        device_id: this.values[6] as string,
        signing_payload: this.values[7] as string,
        expires_at: this.values[8] as number,
        used_at: null,
      });
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes('UPDATE login_challenges')) {
      const row = this.db.challenges.get(this.values[1] as string);
      const claimedAt = this.values[8] as number;
      if (row && row.tuyu_id === this.values[2] && row.signer_id === this.values[3]
          && row.key_revision === this.values[4] && row.account_id === this.values[5]
          && row.audience === this.values[6] && row.device_id === this.values[7]
          && row.used_at === null && row.expires_at > claimedAt) {
        row.used_at = this.values[0] as number;
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }
    if (this.sql.includes('INSERT INTO sessions')) {
      this.db.sessions.set(this.values[0] as string, {
        session_token_hash: this.values[0] as string,
        tuyu_id: this.values[1] as string,
        signer_id: this.values[2] as string,
        key_revision: this.values[3] as number,
        account_id: this.values[4] as string,
        audience: this.values[5] as SessionState['audience'],
        device_id: this.values[6] as string,
        created_at: this.values[7] as number,
        expires_at: this.values[8] as number,
      });
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes('INSERT INTO merchant_instances')) {
      this.db.merchantInstances.set(this.values[0] as string, {
        merchant_instance_id: this.values[0] as string,
        merchant_tuyu_id: this.values[1] as string,
        installation_public_key: this.values[2] as string,
        installation_name: this.values[3] as string,
        merchant_type: this.values[4] as MerchantInstanceRow['merchant_type'],
        service_endpoint: this.values[5] as string | null,
        status: 'active', registered_at: this.values[6] as number,
        updated_at: this.values[7] as number,
      });
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes('INSERT INTO merchant_instance_grants')) {
      const key = `${this.values[0]}|${this.values[1]}`;
      this.db.grants.set(key, {
        merchant_instance_id: this.values[0] as string,
        administrator_tuyu_id: this.values[1] as string,
        role: 'MERCHANT_ADMIN', status: 'active',
        granted_by_tuyu_id: this.values[2] as string,
        granted_by_signer_id: this.values[3] as string,
        granted_at: this.values[4] as number, revoked_at: null,
      });
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes("UPDATE merchant_instance_grants SET status='revoked'")) {
      const grant = this.db.grants.get(`${this.values[1]}|${this.values[2]}`);
      if (!grant || grant.status !== 'active') return { meta: { changes: 0 } };
      grant.status = 'revoked'; grant.revoked_at = this.values[0] as number;
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes('INSERT INTO catalog_listings')) {
      const row: CatalogListingRow = {
        listing_id: this.values[0] as string,
        merchant_instance_id: this.values[1] as string,
        capability: this.values[2] as CatalogListingRow['capability'],
        title: this.values[3] as string,
        summary: this.values[4] as string,
        location: this.values[5] as string,
        currency: this.values[6] as string,
        minimum_amount: this.values[7] as number,
        media_url: this.values[8] as string | null,
        service_endpoint: this.values[9] as string,
        installation_public_key: this.values[10] as string,
        source_updated_at: this.values[11] as number,
        expires_at: this.values[12] as number,
        signed_payload: this.values[13] as string,
        signature: this.values[14] as string,
        publication_idempotency_key: this.values[15] as string,
        status: 'active',
        published_at: this.values[16] as number,
      };
      const existing = this.db.catalogListings.get(row.listing_id);
      if (existing && existing.source_updated_at >= row.source_updated_at) {
        return { meta: { changes: 0 } };
      }
      this.db.catalogListings.set(row.listing_id, row);
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes('INSERT INTO trip_posts')) {
      const row: TripPostRow = {
        trip_id: this.values[0] as string,
        author_tuyu_id: this.values[1] as string,
        title: this.values[2] as string,
        content: this.values[3] as string,
        media_keys_json: this.values[4] as string,
        idempotency_key: this.values[5] as string,
        status: 'published',
        created_at: this.values[6] as number,
        updated_at: this.values[7] as number,
      };
      this.db.trips.set(row.trip_id, row);
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes('INSERT INTO chat_conversations')) {
      const row: ChatConversationRow = {
        conversation_id: this.values[0] as string,
        participant_a: this.values[1] as string,
        participant_b: this.values[2] as string,
        created_at: this.values[3] as number,
        updated_at: this.values[4] as number,
      };
      this.db.conversations.set(row.conversation_id, row);
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes('INSERT INTO chat_messages')) {
      const conversationId = this.values[1] as string;
      const row: ChatMessageRow = {
        message_id: this.values[0] as string,
        conversation_id: conversationId,
        sender_tuyu_id: this.values[2] as string,
        sequence: this.values[3] as number,
        content: this.values[4] as string,
        idempotency_key: this.values[5] as string,
        created_at: this.values[6] as number,
      };
      this.db.messages.set(row.message_id, row);
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes('UPDATE chat_conversations SET updated_at')) {
      const row = this.db.conversations.get(this.values[1] as string);
      if (!row) return { meta: { changes: 0 } };
      row.updated_at = this.values[0] as number;
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes('DELETE FROM sessions WHERE session_token_hash')) {
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
    if (this.sql.includes('UPDATE chat_conversations')) {
      const conversationId = this.values[1] as string;
      const row = this.db.conversations.get(conversationId);
      if (!row) return null;
      row.updated_at = this.values[0] as number;
      const nextSequence = (this.db.chatSequences.get(conversationId) ?? 0) + 1;
      this.db.chatSequences.set(conversationId, nextSequence);
      return { next_sequence: nextSequence } as T;
    }
    if (this.sql.includes('FROM software_releases')) {
      const tag = this.db.releases.get(`${this.values[0]}:${this.values[1]}`);
      return tag === undefined ? null : { version_tag: tag } as T;
    }
    if (this.sql.includes('FROM users WHERE tuyu_id')) {
      return (this.db.users.get(this.values[0] as string) as T | undefined) ?? null;
    }
    if (this.sql.includes("FROM tuyu_signers\n      WHERE tuyu_id")) {
      const signer = [...this.db.signers.values()].find((item) =>
        item.tuyu_id === this.values[0] && item.account_id === this.values[1] && item.status === 'active');
      return (signer as T | undefined) ?? null;
    }
    if (this.sql.includes('FROM tuyu_signers WHERE account_id')) {
      const signer = [...this.db.signers.values()].find((item) => item.account_id === this.values[0]);
      return (signer as T | undefined) ?? null;
    }
    if (this.sql.includes('FROM login_challenges')) {
      return (this.db.challenges.get(this.values[0] as string) as T | undefined) ?? null;
    }
    if (this.sql.includes('FROM merchant_instances WHERE merchant_instance_id')) {
      return (this.db.merchantInstances.get(this.values[0] as string) as T | undefined) ?? null;
    }
    if (this.sql.includes('SELECT role FROM merchant_instance_grants')) {
      const grant = this.db.grants.get(`${this.values[0]}|${this.values[1]}`);
      return (grant?.status === 'active' ? { role: grant.role } as T : null);
    }
    if (this.sql.includes('FROM catalog_listings WHERE publication_idempotency_key')) {
      const row = [...this.db.catalogListings.values()].find(
        (item) => item.publication_idempotency_key === this.values[0],
      );
      return (row as T | undefined) ?? null;
    }
    if (this.sql.includes('FROM catalog_listings WHERE listing_id')) {
      const row = this.db.catalogListings.get(this.values[0] as string);
      return (row && row.status === 'active' && row.expires_at > (this.values[1] as number)
        ? row as T : null);
    }
    if (this.sql.includes('FROM trip_posts WHERE author_tuyu_id')) {
      const row = [...this.db.trips.values()].find((item) =>
        item.author_tuyu_id === this.values[0] && item.idempotency_key === this.values[1]);
      return (row as T | undefined) ?? null;
    }
    if (this.sql.includes('FROM chat_conversations WHERE participant_a')) {
      const row = [...this.db.conversations.values()].find((item) =>
        item.participant_a === this.values[0] && item.participant_b === this.values[1]);
      return (row as T | undefined) ?? null;
    }
    if (this.sql.includes('FROM chat_conversations WHERE conversation_id')) {
      return (this.db.conversations.get(this.values[0] as string) as T | undefined) ?? null;
    }
    if (this.sql.includes('FROM chat_messages\n      WHERE conversation_id')) {
      const row = [...this.db.messages.values()].find((item) =>
        item.conversation_id === this.values[0] && item.sender_tuyu_id === this.values[1]
          && item.idempotency_key === this.values[2]);
      return (row as T | undefined) ?? null;
    }
    if (this.sql.includes('FROM chat_messages WHERE message_id')) {
      return (this.db.messages.get(this.values[0] as string) as T | undefined) ?? null;
    }
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    if (this.sql.includes('FROM catalog_listings')) {
      const now = this.values[0] as number;
      const capability = this.values.length === 7 ? this.values[1] : null;
      const query = this.values[capability === null ? 1 : 2] as string;
      const limit = this.values.at(-1) as number;
      const rows = [...this.db.catalogListings.values()]
        .filter((item) => item.status === 'active' && item.expires_at > now)
        .filter((item) => capability === null || item.capability === capability)
        .filter((item) => query === '' || `${item.title} ${item.summary} ${item.location}`.includes(query))
        .sort((left, right) => right.source_updated_at - left.source_updated_at)
        .slice(0, limit);
      return { results: rows as T[] };
    }
    if (this.sql.includes('FROM trip_posts')) {
      const rows = [...this.db.trips.values()]
        .filter((item) => item.status === 'published')
        .sort((left, right) => right.created_at - left.created_at)
        .slice(0, this.values[0] as number);
      return { results: rows as T[] };
    }
    if (this.sql.includes('FROM chat_conversations')) {
      const rows = [...this.db.conversations.values()]
        .filter((item) => item.participant_a === this.values[0] || item.participant_b === this.values[1])
        .sort((left, right) => right.updated_at - left.updated_at)
        .slice(0, this.values[2] as number);
      return { results: rows as T[] };
    }
    if (this.sql.includes('FROM chat_messages')) {
      const rows = [...this.db.messages.values()]
        .filter((item) => item.conversation_id === this.values[0]
          && item.sequence > (this.values[1] as number))
        .sort((left, right) => left.sequence - right.sequence)
        .slice(0, this.values[2] as number);
      return { results: rows as T[] };
    }
    return { results: [] };
  }
}

export class MemoryDb {
  readonly releases = new Map<string, string>();
  readonly users = new Map<string, UserRow>();
  readonly signers = new Map<string, TuyuSignerRow>();
  readonly merchantInstances = new Map<string, MerchantInstanceRow>();
  readonly grants = new Map<string, MerchantGrantRow>();
  readonly challenges = new Map<string, LoginChallengeRow>();
  readonly sessions = new Map<string, SessionIndexRow>();
  readonly catalogListings = new Map<string, CatalogListingRow>();
  readonly trips = new Map<string, TripPostRow>();
  readonly conversations = new Map<string, ChatConversationRow>();
  readonly messages = new Map<string, ChatMessageRow>();
  readonly chatSequences = new Map<string, number>();
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
