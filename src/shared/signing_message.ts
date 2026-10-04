import { blake2AsU8a } from '@polkadot/util-crypto/blake2';

// 独立途遇签名域。登录只签固定域、op_tag 和 SCALE payload 的 Blake2-256 摘要。
export const TUYU_SIGN_DOMAIN = [0x54, 0x55, 0x59, 0x55];
export const OP_SIGN_TUYU_LOGIN = 0x01;

export function signingMessage(opTag: number, scalePayload: Uint8Array): Uint8Array {
  return blake2AsU8a(
    new Uint8Array([...TUYU_SIGN_DOMAIN, opTag & 0xff, ...scalePayload]),
    256,
  );
}

export function scaleString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  return concatBytes(scaleCompact(bytes.length), bytes);
}

export function scaleCompact(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('scale_compact_out_of_range');
  if (value < 1 << 6) return new Uint8Array([value << 2]);
  if (value < 1 << 14) {
    const encoded = (value << 2) | 0x01;
    return new Uint8Array([encoded & 0xff, (encoded >>> 8) & 0xff]);
  }
  if (value < 1 << 30) {
    const encoded = (value << 2) | 0x02;
    return new Uint8Array([
      encoded & 0xff,
      (encoded >>> 8) & 0xff,
      (encoded >>> 16) & 0xff,
      (encoded >>> 24) & 0xff,
    ]);
  }
  throw new RangeError('scale_compact_out_of_range');
}

export function u64Le(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('u64_out_of_range');
  let remaining = BigInt(value);
  const result = new Uint8Array(8);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return result;
}

export function concatBytes(...items: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(items.reduce((total, item) => total + item.length, 0));
  let offset = 0;
  for (const item of items) {
    result.set(item, offset);
    offset += item.length;
  }
  return result;
}

export function bytesToHex(value: Uint8Array): string {
  return `0x${[...value].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function hexToBytes(value: string): Uint8Array {
  const bare = value.startsWith('0x') ? value.slice(2) : value;
  if (bare.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(bare)) throw new TypeError('invalid_hex');
  return new Uint8Array(bare.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? []);
}

