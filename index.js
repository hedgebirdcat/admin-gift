import admin from 'firebase-admin';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { isAdminToken, validateGift } from './auth.js';

admin.initializeApp();
setGlobalOptions({ region: 'asia-northeast1', maxInstances: 3 });
const db = admin.firestore();
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '16kb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));

async function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'ログインが必要です' });
  try {
    const token = await admin.auth().verifyIdToken(header.slice(7), true);
    let allowed = isAdminToken(token);
    if (!allowed) {
      const adminDoc = await db.collection('admins').doc(token.uid).get();
      allowed = adminDoc.exists && adminDoc.data()?.active === true;
    }
    if (!allowed) return res.status(403).json({ error: '運営権限がありません。admins/{あなたのUID} を登録してください' });
    req.adminUser = token;
    next();
  } catch (error) {
    console.warn('auth rejected', error.code);
    res.status(401).json({ error: 'ログイン情報が無効です。再ログインしてください' });
  }
}

app.get('/api/admin/session', requireAdmin, (req, res) => res.json({ ok: true, uid: req.adminUser.uid }));
app.post('/api/admin/gifts', requireAdmin, async (req, res) => {
  const parsed = validateGift(req.body);
  if (!parsed.ok) return res.status(400).json({ error: '入力内容を確認してください', details: parsed.errors });
  const { uid, coins, xp, note, idempotencyKey } = parsed.value;
  const userRef = db.collection(process.env.USERS_COLLECTION || 'users').doc(uid);
  const giftRef = db.collection(process.env.GIFTS_COLLECTION || 'adminGifts').doc(idempotencyKey);
  try {
    const result = await db.runTransaction(async (tx) => {
      const giftSnap = await tx.get(giftRef);
      if (giftSnap.exists) return { status: 'duplicate', gift: giftSnap.data() };
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) { const e = new Error('対象ユーザーが存在しません'); e.status = 404; throw e; }
      const user = userSnap.data() || {};
      const oldCoins = Number.isSafeInteger(user.coins) ? user.coins : 0;
      const oldXp = Number.isSafeInteger(user.xp) ? user.xp : 0;
      if (!Number.isSafeInteger(oldCoins + coins) || !Number.isSafeInteger(oldXp + xp)) { const e = new Error('残高の上限を超えます'); e.status = 400; throw e; }
      const gift = { uid, coins, xp, note, status: 'sent', createdBy: req.adminUser.uid, createdByEmail: req.adminUser.email || null, createdAt: admin.firestore.FieldValue.serverTimestamp() };
      tx.update(userRef, { coins: oldCoins + coins, xp: oldXp + xp, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      tx.create(giftRef, gift);
      return { status: 'sent', gift: { id: idempotencyKey, uid, coins, xp, note } };
    });
    res.status(result.status === 'duplicate' ? 200 : 201).json({ ok: true, ...result });
  } catch (error) {
    console.error('gift failed', { uid, idempotencyKey, message: error.message });
    res.status(error.status || 500).json({ error: error.status === 404 || error.status === 400 ? error.message : 'ギフト送信に失敗しました' });
  }
});
export const adminGiftApi = onRequest({ cors: false }, app);
