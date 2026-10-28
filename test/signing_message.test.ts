import { describe, expect, it } from 'vitest';
import { buildLoginScalePayload } from '../account/cloud/service';
import { bytesToHex, OP_SIGN_TUYU_LOGIN, signingMessage, TUYU_SIGN_DOMAIN } from '../src/shared/signing_message';

describe('途遇签名消息', () => {
  const common = {
    tuyuId: 'TUYU-100086', signerId: 'tys_signer', keyRevision: 1,
    accountId: `0x${'1'.repeat(64)}`,
    challengeId: 'tyc_test', deviceId: 'device-1', expiresAt: 1_800_000_000_000,
  };
  it('使用独立TUYU域并生成稳定摘要', () => {
    expect(TUYU_SIGN_DOMAIN).toEqual([0x54, 0x55, 0x59, 0x55]);
    const payload = buildLoginScalePayload({ ...common, productId: 'tuyulove' });
    expect(signingMessage(OP_SIGN_TUYU_LOGIN, payload)).toHaveLength(32);
    expect(bytesToHex(signingMessage(OP_SIGN_TUYU_LOGIN, payload)))
      .toBe('0xa89d4f5fb768695d9965a67d0e3582198c91a00bc4f00fb3505a387763b6f684');
  });
  it('目标产品或签名账户变化时摘要变化', () => {
    const first = signingMessage(OP_SIGN_TUYU_LOGIN, buildLoginScalePayload({
      ...common, productId: 'tuyubooking',
    }));
    const second = signingMessage(OP_SIGN_TUYU_LOGIN, buildLoginScalePayload({
      ...common, signerId: 'tys_other', productId: 'tuyufactory',
    }));
    expect(bytesToHex(first)).not.toBe(bytesToHex(second));
  });
});
