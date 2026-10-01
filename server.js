import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import admin from 'firebase-admin';
import { isAdminToken, parseAdminRoles, validateGiftPayload } from './auth.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const allowedRoles = parseAdminRoles(process.env.ADMIN_ROLES);
const usersCollection = process.env.USERS_COLLECTION || 'users';
const giftsCollection = process.env.GIFTS_COLLECTION || 'adminGifts';

function getFirebaseApp() {
  if (admin.apps.length) return admin.app();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey) {
    return admin.initializeApp({ credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }) });
  }
  return admin.initializeApp({ credential: admin.credential.applicationDefault() });
}

const firebase = getFirebaseApp();
const db = admin.firestore(firebase);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '16kb' }));
app.use('/api/admin', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));

async function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: '認証が必要です' });
  try {
    const decoded = await admin.auth(firebase).verifyIdToken(header.slice(7), true);
    if (!isAdminToken(decoded, allowedRoles)) return res.status(403).json({ error: '運営権限がありません' });
    req.adminUser = decoded;
    return next();
  } catch (error) {
    console.warn('admin auth rejected', { code: error.code, message: error.message });
    return res.status(401).json({ error: '認証トークンが無効です' });
  }
}

app.get('/api/admin/session', requireAdmin, (req, res) => {
  res.json({ ok: true, uid: req.adminUser.uid, email: req.adminUser.email || null });
});

app.post('/api/admin/gifts', requireAdmin, async (req, res) => {
  const parsed = validateGiftPayload(req.body);
  if (!parsed.ok) return res.status(400).json({ error: '入力内容を確認してください', details: parsed.errors });
  const { uid, coins, xp, note, idempotencyKey } = parsed.value;
  const giftRef = db.collection(giftsCollection).doc(idempotencyKey);
  const userRef = db.collection(usersCollection).doc(uid);

  try {
    const result = await db.runTransaction(async (tx) => {
      const [giftSnap, userSnap] = await Promise.all([tx.get(giftRef), tx.get(userRef)]);
      if (giftSnap.exists) return { status: 'duplicate', gift: giftSnap.data() };
      if (!userSnap.exists) {
        const error = new Error('対象ユーザーが存在しません');
        error.status = 404;
        throw error;
      }
      const user = userSnap.data() || {};
      const currentCoins = Number.isSafeInteger(user.coins) ? user.coins : 0;
      const currentXp = Number.isSafeInteger(user.xp) ? user.xp : 0;
      const gift = {
        uid, coins, xp, note,
        status: 'sent',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: req.adminUser.uid,
        createdByEmail: req.adminUser.email || null,
      };
      tx.update(userRef, { coins: currentCoins + coins, xp: currentXp + xp, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      tx.create(giftRef, gift);
      return { status: 'sent', gift: { ...gift, id: giftRef.id } };
    });
    return res.status(result.status === 'duplicate' ? 200 : 201).json({ ok: true, ...result });
  } catch (error) {
    console.error('gift send failed', { uid, idempotencyKey, error: error.message });
    return res.status(error.status || 500).json({ error: error.status === 404 ? error.message : 'ギフト送信に失敗しました' });
  }
});

app.use(express.static(new URL('./public', import.meta.url).pathname));
app.get('*', (_req, res) => res.sendFile(new URL('./public/admin.html', import.meta.url).pathname));

if (process.env.NODE_ENV !== 'test') app.listen(port, '0.0.0.0', () => console.log(`admin gift console listening on ${port}`));
export { app };
