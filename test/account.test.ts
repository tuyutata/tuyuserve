import { describe, expect, it } from 'vitest';
import { readActiveSigner, readSignerByAccountId, readUserByTuyuId } from '../account/cloud/repository';
import type { TuyuSignerRow, UserRow } from '../src/types';
import { createTestEnv } from './support';

describe('途遇号多签名账户仓储', () => {
  it('一个途遇号绑定多个可独立撤销的sr25519账户', async () => {
    const { db, env } = createTestEnv();
    const user: UserRow = { tuyu_id: 'TUYU-100086', status: 'active', created_at: 1, updated_at: 1 };
    const first: TuyuSignerRow = {
      signer_id: 'tys_first', tuyu_id: user.tuyu_id, account_id: `0x${'1'.repeat(64)}`,
      key_revision: 1, device_id: 'device-1', status: 'active', bound_at: 1,
      revoked_at: null, updated_at: 1,
    };
    const second: TuyuSignerRow = {
      signer_id: 'tys_second', tuyu_id: user.tuyu_id, account_id: `0x${'2'.repeat(64)}`,
      key_revision: 1, device_id: 'device-2', status: 'active', bound_at: 1,
      revoked_at: null, updated_at: 1,
    };
    db.users.set(user.tuyu_id, user);
    db.signers.set(first.signer_id, first);
    db.signers.set(second.signer_id, second);
    await expect(readUserByTuyuId(env, user.tuyu_id)).resolves.toEqual(user);
    await expect(readActiveSigner(env, user.tuyu_id, first.account_id)).resolves.toEqual(first);
    await expect(readSignerByAccountId(env, second.account_id)).resolves.toEqual(second);
    first.status = 'revoked'; first.revoked_at = 2;
    await expect(readActiveSigner(env, user.tuyu_id, first.account_id)).resolves.toBeNull();
    await expect(readActiveSigner(env, user.tuyu_id, second.account_id)).resolves.toEqual(second);
  });
});
