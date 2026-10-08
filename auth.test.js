import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdminToken, parseAdminRoles, validateGiftPayload } from '../auth.js';

test('admin claim is accepted', () => assert.equal(isAdminToken({ admin: true }, parseAdminRoles()), true));
test('allowed operator role is accepted', () => assert.equal(isAdminToken({ roles: ['operator'] }, parseAdminRoles('admin,operator')), true));
test('untrusted or missing role is rejected', () => {
  const roles = parseAdminRoles('admin,operator');
  assert.equal(isAdminToken({ admin: false, roles: ['player'] }, roles), false);
  assert.equal(isAdminToken({ admin: true }, new Set()), false);
});
test('gift payload requires positive bounded integer and idempotency key', () => {
  assert.equal(validateGiftPayload({ uid: 'p1', coins: 100, xp: 0, idempotencyKey: 'a'.repeat(16) }).ok, true);
  assert.equal(validateGiftPayload({ uid: 'p1', coins: 0, xp: 0, idempotencyKey: 'a'.repeat(16) }).ok, false);
  assert.equal(validateGiftPayload({ uid: 'p1', coins: -1, xp: 0, idempotencyKey: 'a'.repeat(16) }).ok, false);
  assert.equal(validateGiftPayload({ uid: 'p1', coins: 1, xp: 0 }).ok, false);
});
