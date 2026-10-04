import { ApiError, jsonResponse, readJson } from '../shared/api';
import { assertTuyuId, createId } from '../shared/ids';
import { requireSession } from '../request_guard';
import type { ChatConversationRow, ChatMessageRow, Env, SessionState } from '../types';
import {
  insertConversation,
  insertMessage,
  listConversations,
  listMessages,
  readActiveUser,
  readConversation,
  readConversationByParticipants,
  readMessage,
  readMessageByIdempotency,
} from './repository';

interface CreateConversationRequest { peer_tuyu_id?: unknown; idempotency_key?: unknown }
interface SendMessageRequest { content?: unknown; idempotency_key?: unknown }

function assertIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/u.test(value)) {
    throw new ApiError(400, 'invalid_idempotency_key', '幂等键无效');
  }
  return value;
}

function ensureMember(row: ChatConversationRow, session: SessionState): void {
  if (row.participant_a !== session.tuyu_id && row.participant_b !== session.tuyu_id) {
    throw new ApiError(403, 'chat_access_denied', '无权访问此聊天会话');
  }
}

function responseConversation(row: ChatConversationRow, viewer: string): Record<string, unknown> {
  return {
    conversation_id: row.conversation_id,
    peer_tuyu_id: row.participant_a === viewer ? row.participant_b : row.participant_a,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function responseMessage(row: ChatMessageRow): Record<string, unknown> {
  return {
    message_id: row.message_id,
    conversation_id: row.conversation_id,
    sender_tuyu_id: row.sender_tuyu_id,
    sequence: row.sequence,
    content: row.content,
    created_at: row.created_at,
  };
}

export async function createConversation(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env, 'tuyulove');
  const body = await readJson<CreateConversationRequest>(request);
  assertIdempotencyKey(body.idempotency_key);
  let peerTuyuId: string;
  try { peerTuyuId = assertTuyuId(body.peer_tuyu_id); } catch {
    throw new ApiError(400, 'invalid_chat_peer', '聊天对象无效');
  }
  if (peerTuyuId === session.tuyu_id) {
    throw new ApiError(409, 'self_chat_not_allowed', '不能与自己建立聊天');
  }
  const peer = await readActiveUser(env, peerTuyuId);
  if (!peer || peer.status !== 'active') {
    throw new ApiError(404, 'chat_peer_unavailable', '聊天对象不可用');
  }
  const [participantA, participantB] = [session.tuyu_id, peerTuyuId].sort();
  const existing = await readConversationByParticipants(env, participantA, participantB);
  if (existing) {
    return jsonResponse({ ok: true, conversation: responseConversation(existing, session.tuyu_id) });
  }
  const timestamp = Date.now();
  const row: ChatConversationRow = {
    conversation_id: createId('tcc'),
    participant_a: participantA,
    participant_b: participantB,
    created_at: timestamp,
    updated_at: timestamp,
  };
  try {
    await insertConversation(env, row);
  } catch (error) {
    // 中文注释：双方并发创建同一会话时复用唯一记录，其他写入错误继续失败关闭。
    const concurrent = await readConversationByParticipants(env, participantA, participantB);
    if (concurrent) {
      return jsonResponse({
        ok: true,
        conversation: responseConversation(concurrent, session.tuyu_id),
      });
    }
    throw error;
  }
  return jsonResponse({ ok: true, conversation: responseConversation(row, session.tuyu_id) }, 201);
}

export async function conversations(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env, 'tuyulove');
  const rows = await listConversations(env, session.tuyu_id, 50);
  return jsonResponse({
    ok: true,
    conversations: rows.map((row) => responseConversation(row, session.tuyu_id)),
  });
}

export async function sendMessage(
  request: Request,
  env: Env,
  conversationId: string,
): Promise<Response> {
  const session = await requireSession(request, env, 'tuyulove');
  const conversation = await readConversation(env, conversationId);
  if (!conversation) throw new ApiError(404, 'chat_not_found', '聊天会话不存在');
  ensureMember(conversation, session);
  const body = await readJson<SendMessageRequest>(request);
  const idempotencyKey = assertIdempotencyKey(body.idempotency_key);
  if (typeof body.content !== 'string' || body.content.trim().length < 1
      || body.content.length > 4_000) {
    throw new ApiError(400, 'invalid_chat_message', '聊天消息无效');
  }
  const repeated = await readMessageByIdempotency(
    env,
    conversationId,
    session.tuyu_id,
    idempotencyKey,
  );
  if (repeated) return jsonResponse({ ok: true, message: responseMessage(repeated) });
  const messageId = createId('tcm');
  try {
    await insertMessage(env, {
      message_id: messageId,
      conversation_id: conversationId,
      sender_tuyu_id: session.tuyu_id,
      content: body.content.trim(),
      idempotency_key: idempotencyKey,
      created_at: Date.now(),
    });
  } catch (error) {
    // 中文注释：并发重复请求只返回先成功的消息；其他数据库错误必须继续失败关闭。
    const concurrent = await readMessageByIdempotency(
      env,
      conversationId,
      session.tuyu_id,
      idempotencyKey,
    );
    if (concurrent) return jsonResponse({ ok: true, message: responseMessage(concurrent) });
    throw error;
  }
  const inserted = await readMessage(env, messageId);
  if (!inserted) throw new ApiError(500, 'chat_write_failed', '聊天消息保存失败');
  return jsonResponse({ ok: true, message: responseMessage(inserted) }, 201);
}

export async function messages(
  request: Request,
  env: Env,
  conversationId: string,
): Promise<Response> {
  const session = await requireSession(request, env, 'tuyulove');
  const conversation = await readConversation(env, conversationId);
  if (!conversation) throw new ApiError(404, 'chat_not_found', '聊天会话不存在');
  ensureMember(conversation, session);
  const url = new URL(request.url);
  const after = Number(url.searchParams.get('after') ?? '0');
  if (!Number.isSafeInteger(after) || after < 0) {
    throw new ApiError(400, 'invalid_chat_cursor', '聊天同步游标无效');
  }
  const rows = await listMessages(env, conversationId, after, 100);
  return jsonResponse({
    ok: true,
    messages: rows.map(responseMessage),
    next_sequence: rows.at(-1)?.sequence ?? after,
  });
}
