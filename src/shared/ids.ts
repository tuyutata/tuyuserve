import type { TuyuAudience } from '../types';

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function assertTuyuId(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 64
    || !/^[A-Za-z0-9._-]+$/.test(value)
  ) {
    throw new TypeError('invalid_tuyu_id');
  }
  return value;
}

export function assertAccountId(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new TypeError('invalid_account_id');
  }
  return value.toLowerCase();
}

export function assertMerchantInstanceId(value: unknown): string {
  if (typeof value !== 'string' || !/^tmi_[0-9a-f]{32}$/.test(value)) {
    throw new TypeError('invalid_merchant_instance_id');
  }
  return value;
}

export function assertDeviceId(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 128
    || !/^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    throw new TypeError('invalid_device_id');
  }
  return value;
}

export function assertAudience(value: unknown): TuyuAudience {
  if (
    value !== 'tuyulove'
    && value !== 'tuyulife'
    && value !== 'tuyuserve'
    && value !== 'tuyubooking'
    && value !== 'tuyufactory'
  ) {
    throw new TypeError('invalid_audience');
  }
  return value;
}
