---
source: src/modules/users/model.ts
sha256: 77c3ed474561e6845ff467975a44bf0ed186fb8b1ccdce9ac7d7d08a44175ad3
generated_at: 2026-09-27T15:37:49.721692+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/model.ts

## Purpose

Defines the Mongoose schema and TypeScript interfaces for the user record, its token subdocuments, two-factor method records, and OAuth account links. Deliberately kept as a single file so the password pre-save hash hook stays colocated with the `select: false` casters that keep the hash off every read. Also re-exports `normalizeEmail` and provides the `hashToken` / `isLiveRefreshSession` helpers that other modules depend on for token comparison and session listing.

## Key elements

- **`TokenType`** — enum (`REFRESH`, `PASSWORD_RESET`, `MFA_CHALLENGE`) naming the token types the JWT layer recognises.
- **`hashToken`** — SHA-256 hex digest used for storing/looking up token values. Exported so callers that compare an in-memory token to an already-loaded document use the same digest as storage.
- **`normalizeEmail`** (re-export) — case-insensitive, trimmed email comparison for in-memory checks that bypass the schema's automatic casters.
- **`Token`** — subdocument shape for refresh, password-reset, and delete-confirmation tokens. Carries `sentAt`, `lastUsedAt`, `supersededAt`, and `amr` for session display, cooldown, rotation-grace, and auth-method recording.
- **`isLiveRefreshSession`** — predicate: token is a refresh type **and** not yet superseded (i.e. still a valid session).
- **`UserRecord`** — full document shape. Extends the wire `User` contract with `Date`-typed timestamps, optional `password`, `pendingEmail` (both `select: false`), `inactivityWarnedAt`, `twoFactorMethods`, `twoFactorBackupCodes` + salt, `tokens`, and `oauthAccounts`. Omits `role` entirely (lives in `@modules/access`).
- **`TwoFactorMethodRecord`** — one enrolled or pending second factor (TOTP, email, …). Distinguishes armed vs. half-set-up via `enrolledAt`.
- **`OAuthAccount`** — one linked OAuth/OIDC identity keyed by `provider` + `providerId` (stable "sub", never email).
- **`UserDocument`** — `UserRecord` + `UserMethods` + Mongoose `Document` guarantees; adds `pendingImageKey` for the image-digest pipeline.
- **`UserMethods`** — instance methods (`tokenAdd`, `tokenSupersede`, `consumeToken`, `toUser`, …). `tokenAdd` accepts `Token['type']` (a plain `string`) because the tokens array also carries account-deletion types outside the `TokenType` enum.

## Relationships

- **`@infrastructure/i18n`** — imports `t` for user-facing messages emitted by schema validators or model methods.
- **`@infrastructure/persistence/normalize-email`** — re-exports `normalizeEmail` so existing barrel-import callers keep working.
- **`@infrastructure/persistence/serialize`** — imports `applySerialization` to shape the document into the wire contract.
- **`@infrastructure/security/pii-encryption`** — imports `decryptPii` to decrypt sensitive fields before they leave the document.
- **`account/services/tokens.ts`** — calls `hashToken` to compare an in-memory token against an already-loaded document without re-querying.
- **`account/services/two-factor.ts`** — reads/writes `TwoFactorMethodRecord` entries; mints and verifies `MFA_CHALLENGE` tokens; reads back `amr` from the token after verification.
- **`account/services/oauth.ts`** — sole writer of `OAuthAccount[]`; the OAuth-only signup branch leaves `password` absent.
- **`account/services/profile.ts`** — uses the re-exported `normalizeEmail` for the "is this the current address" guard.
- **`account/services/verification.ts`** — sets/clears `pendingEmail` and issues/consumes the `'email-change'` token.
- **`account/services/authentication.ts`** — loads `UserDocument`, calls `tokenAdd` / `consumeToken`, checks `password` hash on sign-in.
- **`account/session/jwt.ts`** — interprets `TokenType` values when issuing/validating access and refresh JWTs.
- **`account/controllers/post-logout-everywhere.ts`** — revokes all refresh tokens (supersedes or removes entries in `tokens[]`).
- **`scripts/ops/reap-inactive-accounts.ts`** — stamps `inactivityWarnedAt` on first warning; later distinguishes its own soft-deletes from admin ones.
- **`shared/contracts/openapi.root.yaml`** — the `User` wire contract that `UserRecord` extends (via `Omit<…>`) with document-only fields and `Date`-typed timestamps.

## Notes

- `password` and `pendingEmail` are `select: false`; any query that needs them must explicitly `.select('+password')` or equivalent. OAuth-only accounts have no `password` at all until a "add password" flow is added.
- `Token.type` is typed as `string`, **not** `TokenType`, because the tokens array also stores account-deletion tokens the enum doesn't name. `isLiveRefreshSession` therefore casts the enum member to compare.
- Timestamps (`createdAt`, `updatedAt`, `twoFactorEnabledAt`, `verifiedAt`) are redeclared as `Date` in `UserRecord` while the wire contract carries ISO strings — `applySerialization` bridges the gap on output.
- `role` does **not** exist on the user document. `toUser` accepts the caller's current role as an explicit parameter; any code that reads `doc.role` will get `undefined`.
- `hashToken` uses plain SHA-256, not bcrypt, because every token value already carries ≥128 bits of entropy; bcrypt would add latency to the hot refresh path with no security benefit.
- `supersededAt` is set on rotation but the entry is **not** immediately deleted — a short grace window prevents two tabs racing to refresh from triggering reuse-detection.
