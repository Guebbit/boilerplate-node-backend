---
source: src/modules/users/model.ts
sha256: e23371358ec2d0bd2d888a0308d84a2a51e9cf39ab01dbb47bf7001647b65729
generated_at: 2026-10-15T12:08:25.600844+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/model.ts

## Purpose

Defines the Mongoose schema, document interface, and all sub-document types (`TwoFactorMethodRecord`, `OAuthAccount`, `DeliveredCodeState`) for the user account. It is deliberately a single file so the pre-save password-hash hook and the `select: false` field remain co-located. The `UserRecord` interface is the authoritative shape of what a Mongoose user document holds, bridging the wire `User` contract (ISO strings) to real `Date` values in the database.

## Key elements

- **`UserRecord`** — Interface extending `User` (from `@types`) with document-specific fields: `password`, `deletedAt`, `inactivityWarnedAt`, `lastActiveAt`, `lastApiKeyUseAt`, `inactivityMinimisedAt`, `deletedBy`, `twoFactorMethods`, `reauthCode`, `mfaFailures`, `tokensValidAfter`, `mfaLockedUntil`, `twoFactorBackupCodes`, `twoFactorBackupCodeSalt`, `oauthAccounts`, `pendingEmail`, `previousEmail`, and redeclared `Date` fields (`createdAt`, `updatedAt`, `twoFactorEnabledAt`, `verifiedAt`, `analyticsConsentAt`, `termsAcceptedAt`). Excludes `role` entirely (owned by the access module).
- **`UserDocument`** — `UserRecord` + Mongoose `Document` guarantees (`id`, `pendingImageKey`).
- **`UserModel`** — `Model<UserDocument>` alias for typing the Mongoose model.
- **`userSchema`** — The Mongoose `Schema` instance wiring field validators, defaults, the pre-save `hashPassword` hook, `revisionPlugin`, and `applySerialization`.
- **`TwoFactorMethodRecord`** — Shape of one enrolled/pending second factor (method, `enrolledAt`, `secret`, `lastUsedStep`, plus `DeliveredCodeState` fields).
- **`DeliveredCodeState`** — The four fields (`codeHash`, `codeExpiresAt`, `codeSentAt`, `codeAttempts`) shared by 2FA method codes and the step-up `reauthCode`.
- **`DELIVERED_CODE_FIELDS`** — `as const` tuple of the four field names above, used by `DeliveredCodeSlot`-based conditional writes.
- **`DeliveredCodeSlot`** — Discriminated union identifying where a code lives: `{ kind: 'reauth' }` or `{ kind: 'method'; method: string }`.
- **`MfaReservation`** — Return shape of `reserveMfaAttempt`: `reserved` (may compare?) and `lockedNow` (this call tripped the lock).
- **`OAuthAccount`** — One linked provider identity (`provider`, `providerId`, `connectedAt`).
- **`phoneAad(userId)`** — Builds the authenticated-encryption associated-data string (`users:phone:{userId}`) for encrypting/decrypting a stored phone number.

## Relationships

- **`src/infrastructure/security/password-hash.ts`** — Imports `hashPassword`; wired into a `pre('save')` hook on `userSchema` so the raw password is hashed before the document reaches Mongo.
- **`src/infrastructure/persistence/revision-plugin.ts`** — Imports `revisionPlugin` and applies it to the schema for document revision tracking.
- **`src/infrastructure/persistence/serialize.ts`** — Imports `applySerialization` to attach Mongoose serialization middleware to the schema.
- **`src/infrastructure/i18n/config.ts`** — Imports `localeConfig` (used in schema defaults or validation).
- **`shared/contracts/openapi.root.yaml`** — The `User` type (imported from `@types`) is the generated TypeScript shape of the OpenAPI `User` object; `UserRecord` omits and redeclares its date fields as `Date` instead of ISO strings.
- **`src/modules/account/services/oauth.ts`** — Sole writer of `oauthAccounts`; its `registerFromOAuth` path is the one that bypasses Zod validation and hits the schema-level email `match` regex.
- **`src/modules/account/services/email-change.ts`** — Writes `pendingEmail` and `previousEmail` (both `select: false`); the undo flow restores `previousEmail`.
- **`src/modules/account/services/login.ts`** — Reads `password`, `twoFactorMethods`, `mfaFailures`, `mfaLockedUntil`, `tokensValidAfter`, `twoFactorBackupCodes`; stamps `lastActiveAt`.
- **`src/modules/account/services/profile.ts`** — Reads/writes profile fields on the document.
- **`src/modules/account/services/caller.ts`** — Reads the user document for per-request context.
- **`src/modules/account/services/deletion-request.ts`** — Sets `deletedAt` and `deletedBy` during soft-delete.
- **`src/modules/account/services/password.ts`** / **`password-reset.ts`** / **`password-reset-request.ts`** — Read/write the `password` field and `reauthCode`.
- **`src/modules/account/services/logout.ts`** — Bumps `tokensValidAfter` (session epoch) on logout/compromise events.

## Notes

- **`role` is not on this document.** Membership/role lives exclusively in the access module's rows. `presentUser` in `./presenter` receives the caller's role as an explicit parameter rather than reading it off the document.
- **`password` and `pendingEmail`/`previousEmail` are `select: false`.** They are excluded from every query unless explicitly selected. The hash hook and the `select: false` are kept in one file on purpose.
- **ISO-string vs `Date` redeclaration.** The wire contract carries ISO strings; the document carries real `Date` objects (written by `timestamps: true` or service code). `UserRecord` redeclares six date fields as `Date | undefined` to match. A fixture that pinned `createdAt: string` surfaced this mismatch historically.
- **`email` regex is intentionally loose** (one `@`, one `.`, no whitespace). It is a backstop for the one Zod-less path (`registerFromOAuth`), not the primary validation.
- **`lastActiveAt` / `lastApiKeyUseAt`** are stamped at most once per day; `LAST_ACTIVE_EXPR` in `./repository` combines them with `createdAt` as fallback for accounts that never signed in.
- **`inactivityWarnedAt` / `inactivityMinimisedAt`** are written only by `scripts/ops/reap-inactive-accounts.ts`. An account active again since either date is re-warned or re-minimised.
- **`mfaFailures`** is a single shared counter across all 2FA methods and the reauth code within a window; written only by `reserveMfaAttempt` and `resetMfaAttempts`.
- **`phoneAad`** must be spelled identically at every call site that encrypts or decrypts a phone; a typo in any copy makes the stored value undecryptable.
