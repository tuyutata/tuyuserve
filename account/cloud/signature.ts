import { signatureVerify } from '@polkadot/util-crypto/signature/verify';

// 途遇账户主认证只接受 sr25519，非法签名和公钥统一返回 false。
export async function verifyWalletSignature(
  message: Uint8Array,
  signature: string,
  accountId: string,
): Promise<boolean> {
  try {
    const result = signatureVerify(message, signature, accountId);
    return result.isValid && result.crypto === 'sr25519';
  } catch {
    return false;
  }
}
