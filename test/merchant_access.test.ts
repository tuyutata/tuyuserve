import { describe, expect, it } from 'vitest';
import { storeSession } from '../account/cloud/session';
import { readMerchantRole } from '../src/merchant/repository';
import {
  grantMerchantAdministrator,
  registerMerchantInstance,
  revokeMerchantAdministrator,
} from '../src/merchant/service';
import type { SessionState, TuyuSignerRow, UserRow } from '../src/types';
import { createTestEnv, request, responseJson } from './support';

const owner: UserRow = { tuyu_id: 'TUYU-OWNER', status: 'active', created_at: 1, updated_at: 1 };
const admin: UserRow = { tuyu_id: 'TUYU-ADMIN', status: 'active', created_at: 1, updated_at: 1 };
const signer: TuyuSignerRow = {
  signer_id: 'tys_owner', tuyu_id: owner.tuyu_id, account_id: `0x${'1'.repeat(64)}`,
  key_revision: 1, device_id: 'owner-device', status: 'active', bound_at: 1,
  revoked_at: null, updated_at: 1,
};

function session(): SessionState {
  return {
    tuyu_id: owner.tuyu_id, signer_id: signer.signer_id, key_revision: 1,
    account_id: signer.account_id, audience: 'tuyubooking', device_id: signer.device_id,
    created_at: Date.now(), expires_at: Date.now() + 60_000,
  };
}

describe('商家端多对多管理员授权', () => {
  it('一个途遇号管理多个商家端且授权可独立撤销', async () => {
    const fixture = createTestEnv();
    fixture.db.users.set(owner.tuyu_id, owner);
    fixture.db.users.set(admin.tuyu_id, admin);
    fixture.db.signers.set(signer.signer_id, signer);
    const firstId = `tmi_${'1'.repeat(32)}`;
    const secondId = `tmi_${'2'.repeat(32)}`;
    await storeSession(fixture.env, 'registration-token', session(), 60);
    const registered = await registerMerchantInstance(request('/v1/merchant-instances/register', {
      merchant_instance_id: firstId,
      installation_public_key: `0x${'3'.repeat(64)}`,
      installation_name: 'A酒店', merchant_type: 'hotel',
      service_endpoint: 'https://hotel.example',
    }, 'registration-token'), fixture.env);
    expect(registered.status).toBe(201);
    expect((await responseJson(registered)).role).toBe('MERCHANT_OWNER');

    fixture.db.merchantInstances.set(secondId, {
      merchant_instance_id: secondId, merchant_tuyu_id: owner.tuyu_id,
      installation_public_key: `0x${'4'.repeat(64)}`, installation_name: 'B餐厅',
      merchant_type: 'restaurant', service_endpoint: 'https://restaurant.example',
      status: 'active', registered_at: 1, updated_at: 1,
    });
    await storeSession(fixture.env, 'owner-first', session(), 60);
    await storeSession(fixture.env, 'owner-second', session(), 60);
    await grantMerchantAdministrator(request('/v1/merchant-instances/grants', {
      merchant_instance_id: firstId, administrator_tuyu_id: admin.tuyu_id,
    }, 'owner-first'), fixture.env);
    await grantMerchantAdministrator(request('/v1/merchant-instances/grants', {
      merchant_instance_id: secondId, administrator_tuyu_id: admin.tuyu_id,
    }, 'owner-second'), fixture.env);
    await expect(readMerchantRole(fixture.env, firstId, admin.tuyu_id))
      .resolves.toBe('MERCHANT_ADMIN');
    await expect(readMerchantRole(fixture.env, secondId, admin.tuyu_id))
      .resolves.toBe('MERCHANT_ADMIN');

    await revokeMerchantAdministrator(request('/v1/merchant-instances/grants/revoke', {
      merchant_instance_id: firstId, administrator_tuyu_id: admin.tuyu_id,
    }, 'owner-first'), fixture.env);
    await expect(readMerchantRole(fixture.env, firstId, admin.tuyu_id)).resolves.toBeNull();
    await expect(readMerchantRole(fixture.env, secondId, admin.tuyu_id))
      .resolves.toBe('MERCHANT_ADMIN');
  });

  it('所属途遇号是不可撤销的唯一所有者', async () => {
    const fixture = createTestEnv();
    fixture.db.users.set(owner.tuyu_id, owner);
    fixture.db.signers.set(signer.signer_id, signer);
    const instanceId = `tmi_${'8'.repeat(32)}`;
    fixture.db.merchantInstances.set(instanceId, {
      merchant_instance_id: instanceId, merchant_tuyu_id: owner.tuyu_id,
      installation_public_key: `0x${'8'.repeat(64)}`, installation_name: 'C景区',
      merchant_type: 'scenic', service_endpoint: 'https://scenic.example', status: 'active',
      registered_at: 1, updated_at: 1,
    });
    await storeSession(fixture.env, 'owner-token', session(), 60);
    await expect(grantMerchantAdministrator(request('/v1/merchant-instances/grants', {
      merchant_instance_id: instanceId, administrator_tuyu_id: owner.tuyu_id,
    }, 'owner-token'), fixture.env)).rejects.toMatchObject({ code: 'owner_grant_not_allowed' });
    await expect(revokeMerchantAdministrator(request('/v1/merchant-instances/grants/revoke', {
      merchant_instance_id: instanceId, administrator_tuyu_id: owner.tuyu_id,
    }, 'owner-token'), fixture.env)).rejects.toMatchObject({ code: 'owner_revocation_forbidden' });
  });
});
