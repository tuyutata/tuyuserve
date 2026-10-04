import type { ChatConversationRow, ChatMessageRow, Env, UserRow } from '../types';

export async function readActiveUser(env: Env, tuyuId: string): Promise<UserRow | null> {
  return env.DB.prepare(
    `SELECT tuyu_id, status, created_at, updated_at FROM users WHERE tuyu_id = ?`,
  ).bind(tuyuId).first<UserRow>();
}

export async function readConversationByParticipants(
  env: Env,
  participantA: string,
  participantB: string,
): Promise<ChatConversationRow | null> {
  return env.DB.prepare(
    `SELECT * FROM chat_conversations WHERE participant_a = ? AND participant_b = ?`,
  ).bind(participantA, participantB).first<ChatConversationRow>();
}

export async function readConversation(
  env: Env,
  conversationId: string,
): Promise<ChatConversationRow | null> {
  return env.DB.prepare(
    `SELECT * FROM chat_conversations WHERE conversation_id = ?`,
  ).bind(conversationId).first<ChatConversationRow>();
}

export async function insertConversation(env: Env, row: ChatConversationRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO chat_conversations
      (conversation_id, participant_a, participant_b, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)`,
  ).bind(
    row.conversation_id,
    row.participant_a,
    row.participant_b,
    row.created_at,
    row.updated_at,
  ).run();
}

export async function listConversations(
  env: Env,
  tuyuId: string,
  limit: number,
): Promise<ChatConversationRow[]> {
  return (await env.DB.prepare(
    `SELECT * FROM chat_conversations
      WHERE participant_a = ? OR participant_b = ?
      ORDER BY updated_at DESC, conversation_id ASC LIMIT ?`,
  ).bind(tuyuId, tuyuId, limit).all<ChatConversationRow>()).results;
}

export async function readMessageByIdempotency(
  env: Env,
  conversationId: string,
  senderTuyuId: string,
  idempotencyKey: string,
): Promise<ChatMessageRow | null> {
  return env.DB.prepare(
    `SELECT * FROM chat_messages
      WHERE conversation_id = ? AND sender_tuyu_id = ? AND idempotency_key = ?`,
  ).bind(conversationId, senderTuyuId, idempotencyKey).first<ChatMessageRow>();
}

export async function insertMessage(env: Env, row: Omit<ChatMessageRow, 'sequence'>): Promise<void> {
  // 中文注释：先用会话行原子分配序号，D1 与 PostgreSQL 并发写入都不会生成重复序号。
  const allocation = await env.DB.prepare(
    `UPDATE chat_conversations
      SET next_sequence = next_sequence + 1, updated_at = ?
      WHERE conversation_id = ?
      RETURNING next_sequence`,
  ).bind(row.created_at, row.conversation_id).first<{ next_sequence: number }>();
  if (!allocation) throw new Error('chat_conversation_missing');
  await env.DB.prepare(
    `INSERT INTO chat_messages
      (message_id, conversation_id, sender_tuyu_id, sequence, content,
       idempotency_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    row.message_id,
    row.conversation_id,
    row.sender_tuyu_id,
    allocation.next_sequence,
    row.content,
    row.idempotency_key,
    row.created_at,
  ).run();
}

export async function readMessage(env: Env, messageId: string): Promise<ChatMessageRow | null> {
  return env.DB.prepare(
    `SELECT * FROM chat_messages WHERE message_id = ?`,
  ).bind(messageId).first<ChatMessageRow>();
}

export async function listMessages(
  env: Env,
  conversationId: string,
  afterSequence: number,
  limit: number,
): Promise<ChatMessageRow[]> {
  return (await env.DB.prepare(
    `SELECT * FROM chat_messages
      WHERE conversation_id = ? AND sequence > ?
      ORDER BY sequence ASC LIMIT ?`,
  ).bind(conversationId, afterSequence, limit).all<ChatMessageRow>()).results;
}
