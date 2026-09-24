---
source: src/modules/users/model.ts
sha256: ba75254ca15e3330957ebbbc409784696bec70d967ec3dda792efabd0994b5b4
generated_at: 2026-09-23T19:33:12.334295+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/model.ts

## Purpose

Defines the Mongoose schema, Zod wire-validation schema, token subdocument helpers, and TypeScript interfaces for the user record. Kept as a single file deliberately so the bcrypt pre-save hook stays collocated with the `select: false` that hides the password hash from every read.

## Key elements

- **`TokenType`** — enum of token categories: `REFRESH`, `PASSWORD_RESET`, `MFA_CHALLENGE`.
- **`hashToken(token)`** — sha256 hex digest used for storing/looking up token values. Exported so one-off scripts and in-memory comparisons use the same algorithm.
- **`Token`** — subdocument shape (`token`, `type`, `expiration`, `sentAt`, `lastUsedAt`, `supersededAt`, `amr`). `_id` is the only field safe to expose to clients (used as a revocation handle in `GET /account/sessions`).
- **`isLiveRefreshSession(token)`** — predicate that identifies a non-superseded refresh token (i.e. an active session) for listing.
- **`UserRecord`** — TypeScript shape of the stored document. Omits `role` (lives in the access module) and redeclares ISO-string contract dates as `Date`. Adds `password`, `deletedAt`, `inactivityWarnedAt`, `twoFactorMethods`, `twoFactorBackupCodes`, `tokens`, `oauthAccounts`, `pendingEmail`.
- **`TwoFactorMethodRecord`** — single shape for all 2FA methods (TOTP, email, …); `enrolledAt` distinguishes armed from abandoned factors.
- **`OAuthAccount`** — one linked provider identity keyed by `provider` + `providerId` (stable `sub`, never email).
- **`UserDocument`** — `UserRecord` + `UserMethods` + Mongoose `Document`; adds document-only `pendingImageKey`.
- **`UserMethods`** — instance methods `tokenAdd` and `tokenRemoveAll` (accept `Token['type']`, not the enum, because the array also holds types the JWT layer doesn't know).
- **`UserModel`** — `Model<UserDocument, …, UserMethods>` type for typed queries.
- **Zod wire schema** — built on orval-generated `CreateUserBody`; only fields needing custom i18n messages are overridden. All error messages are thunks (`() => t(...)`) to defer evaluation past `i18next.init()`.
- **Mongoose schema** — `password` is `select: false` + pre-save bcrypt hook; `pendingEmail` is also `select: false`.

## Relationships

- **`src/modules/account/services/tokens.ts`** — primary consumer: calls `hashToken`, `isLiveRefreshSession`, `tokenAdd`, `tokenRemoveAll` on the document.
- **`src/modules/account/services/authentication.ts`** — reads the hashed `password` for verification; mints/validates `REFRESH` tokens.
- **`src/modules/account/services/oauth.ts`** — sole writer of `oauthAccounts`; creates OAuth-only users with `password` absent.
- **`src/modules/account/services/two-factor.ts`** — reads/writes `twoFactorMethods`, `twoFactorBackupCodes`; reads `amr` from `MFA_CHALLENGE` tokens.
- **`src/modules/account/services/verification.ts`** — manages `pendingEmail` and the `'email-change'` token type.
- **`src/modules/account/session/jwt.ts`** — consumes `TokenType` to classify refresh vs. access JWTs.
- **`src/modules/account/controllers/post-logout-everywhere.ts`** — calls `tokenRemoveAll(REFRESH)` to invalidate all sessions.
- **`src/infrastructure/i18n/context.ts` / `index.ts`** — supplies `t()` used inside the Zod schema's lazy error thunks.
- **`src/infrastructure/persistence/serialize.ts`** — `applySerialization` is imported to wire serialization behaviour onto the schema.
- **`src/infrastructure/security/pii-encryption.ts`** — `decryptPii` is imported for decrypting PII fields on read.
- **`scripts/ops/reap-inactive-accounts.ts`** — stamps `inactivityWarnedAt` and reads it to distinguish its own soft-deletes from admin deletes.
- **`shared/contracts/openapi.root.yaml`** — the `User` wire contract (ISO-string dates) that `UserRecord` redeclares as `Date` internally.
- **`src/modules/account/tests/contract/api.contract.test.ts`** — asserts the wire shape matches the OpenAPI contract.

## Notes

- `Token.type` is intentionally `string`, not `TokenType`. The enum covers only JWT-layer types; the array also stores account-deletion tokens. Code comparing against a specific type must cast (`TokenType.REFRESH as string`).
- `supersededAt` is never deleted — it powers the refresh-reuse detection grace window. A token with this field set is **not** a live session.
- `amr` on a token is absent for all non-`MFA_CHALLENGE` types and for pre-field-introduction rows; the read side defaults to `['pwd']`.
- The Zod schema and the Mongoose schema are siblings by design (one per transport boundary), not a single source of truth. Keep them in sync when adding fields.
- All Zod error messages are thunks. Calling `t()` eagerly at module-eval time returns `undefined` because `i18next.init()` hasn't run yet.
