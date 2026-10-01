export function parseAdminRoles(value = 'admin,operator') {
  return new Set(String(value).split(',').map((role) => role.trim()).filter(Boolean));
}

/**
 * Firebase Admin verifyIdToken() が返す decoded token をサーバー側で判定する。
 * クライアントから送られた role/admin フィールドは一切信用しない。
 */
export function isAdminToken(decodedToken, allowedRoles) {
  if (!decodedToken || !allowedRoles?.size) return false;
  if (decodedToken.admin === true) return true;
  const claimsRoles = Array.isArray(decodedToken.roles) ? decodedToken.roles : [];
  return claimsRoles.some((role) => allowedRoles.has(role));
}

export function validateGiftPayload(body = {}) {
  const uid = typeof body.uid === 'string' ? body.uid.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
  const coins = Number.isSafeInteger(body.coins) ? body.coins : Number(body.coins);
  const xp = Number.isSafeInteger(body.xp) ? body.xp : Number(body.xp);
  const errors = [];

  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) errors.push('uid must be 1-128 ASCII characters');
  if (!Number.isSafeInteger(coins) || coins < 0 || coins > 1_000_000_000) errors.push('coins must be an integer between 0 and 1,000,000,000');
  if (!Number.isSafeInteger(xp) || xp < 0 || xp > 1_000_000_000) errors.push('xp must be an integer between 0 and 1,000,000,000');
  if (coins === 0 && xp === 0) errors.push('coins or xp must be greater than 0');
  if (note.length > 500) errors.push('note must be 500 characters or fewer');
  if (!/^[A-Za-z0-9:_-]{16,128}$/.test(idempotencyKey)) errors.push('idempotencyKey is required and must be 16-128 ASCII characters');
  return { ok: errors.length === 0, errors, value: { uid, coins, xp, note, idempotencyKey } };
}
