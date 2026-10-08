function roles(value = 'admin,operator') {
  return new Set(String(value).split(',').map((v) => v.trim()).filter(Boolean));
}
export function isAdminToken(token) {
  const allowed = roles(process.env.ADMIN_ROLES || 'admin,operator');
  if (token?.admin === true) return true;
  return Array.isArray(token?.roles) && token.roles.some((role) => allowed.has(role));
}
export function validateGift(body = {}) {
  const uid = typeof body.uid === 'string' ? body.uid.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
  const coins = Number(body.coins);
  const xp = Number(body.xp);
  const errors = [];
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) errors.push('UIDが正しくありません');
  if (!Number.isSafeInteger(coins) || coins < 0 || coins > 1000000000) errors.push('コインは0〜1,000,000,000の整数で入力してください');
  if (!Number.isSafeInteger(xp) || xp < 0 || xp > 1000000000) errors.push('XPは0〜1,000,000,000の整数で入力してください');
  if (coins === 0 && xp === 0) errors.push('コインまたはXPを1以上入力してください');
  if (note.length > 500) errors.push('メモは500文字以内で入力してください');
  if (!/^[A-Za-z0-9:_-]{16,128}$/.test(idempotencyKey)) errors.push('送信IDが正しくありません');
  return { ok: errors.length === 0, errors, value: { uid, coins, xp, note, idempotencyKey } };
}
