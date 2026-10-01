# 運営専用ギフト送信画面

`admin.html` とサーバー側APIを含む、Firebase Authentication + Firestore向けの運営ギフト送信モジュールです。

## セキュリティ設計

- **権限チェックは必ずサーバー側**で実施。`Authorization: Bearer <Firebase ID token>` を Firebase Admin SDK で検証し、`admin: true` または `roles` に `ADMIN_ROLES` の値がある場合だけ許可します。
- 画面から送られた `admin` / `role` は信用しません。
- Firestoreトランザクションでユーザー残高更新と監査ログ作成を同時実行します。
- 送信ID（`idempotencyKey`）を監査ログ文書IDに使い、二重クリック・再送信による二重配布を防止します。
- レート制限、Helmet、JSONサイズ制限、UID・金額の上限、メモ長を設定しています。

## 導入

```bash
cd admin-gift
npm install
cp .env.example .env
# .env にFirebase Admin SDK設定を記入
npm test
npm start
```

`http://localhost:3000/admin.html` を開きます。

既存ログイン画面が Firebase Auth の ID token を取得できるよう、`admin.html` のスクリプトより前に次の関数を注入してください。ID token は毎回 `getIdToken()` で最新化してください。`admin.html` は `<script src>` ではなく、画面として開くか既存テンプレートへ組み込んでください。

```html
<script>
window.getAdminIdToken = () => firebase.auth().currentUser.getIdToken(/* forceRefresh= */ true);
</script>
<!-- この後に admin.html の画面スクリプトを組み込む -->
```

実際には本ファイル内の画面を既存テンプレートへ組み込み、ログインSDKを先に読み込んでください。

## Firestoreデータ契約

- `users/{uid}`: `coins` と `xp` を整数で保持。別名を使うゲームは `server.js` の `tx.update()` を既存フィールド名へ変更。
- `adminGifts/{idempotencyKey}`: `uid`, `coins`, `xp`, `note`, `createdBy`, `createdByEmail`, `createdAt`, `status` を保存。
- Firebase Security Rulesでもクライアントから `users.coins/xp` と `adminGifts` を直接書き込めないようにしてください。配布はAdmin SDKのみを通します。

推奨するカスタムクレーム設定例（管理者本人の保護された運用環境で一度だけ実行）:

```js
await getAuth().setCustomUserClaims(uid, { admin: true, roles: ['operator'] });
```

クレーム変更後は再ログインまたはID token更新が必要です。サービスアカウントJSONや`.env`は公開・Git登録しないでください。
