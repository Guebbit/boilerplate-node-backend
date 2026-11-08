---
source: src/modules/users/model.ts
sha256: 6a3bdc55eb169674bbd401e9954488e6f4fffa356750243d9482c795da559f7d
generated_at: 2026-11-08T08:46:36.306581+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/model.ts

## Purpose

Defines the Mongoose schema and TypeScript interfaces for the user record. Kept as a single file deliberately: the pre-save `hashPassword` hook must sit alongside the `select: false` declaration on `password` so the hash never leaks into reads. Everything else (2FA, OAuth links, purchase holds, email-change state, session-epoch fields) is modelled here so that one schema owns the full document shape.

## Key elements

- **`UserRecord`** – The full document interface. Extends the wire `User` contract (omitting ISO-string dates and `role`, redeclaring them as `Date` or dropping them). Adds fields absent from the wire: `password?`, `deletedAt`, `deletedBy`, `purgeAt`, `lastActiveAt`, `lastApiKeyUseAt`, `inactivityWarnedAt`, `inactivityMinimisedAt`, `twoFactorMethods`, `reauthCode`, `mfaFailures`, `tokensValidAfter`, `mfaLockedUntil`, `twoFactorBackupCodes`, `twoFactorBackupCodeSalt`, `authenticatorEnabledAt`, `purchaseHold`, `purchaseHoldResetAt`, `purchaseHoldFlaggedAt`, `oauthAccounts`, `pendingEmail`, `previousEmail`.
- **`PurchaseHoldRecord`** – Shape of a single protective pause on checkout (`until`, `reason`, optional `note`/`setBy`, `setAt`).
- **`DeliveredCodeState`** – The four fields (`codeHash`, `codeExpiresAt`, `codeSentAt`, `codeAttempts`) shared by any in-flight one-time code (2FA factor or step-up reauth).
- **`DELIVERED_CODE_FIELDS`** – Readonly tuple of those four field names, used for conditional writes.
- **`DeliveredCodeSlot`** – Discriminated union (`'reauth'` vs `'method'`) telling the users module *where* on the document a code lives.
- **`TwoFactorMethodRecord`** – One enrolled/pending 2FA factor. Extends `DeliveredCodeState`; adds `method`, `enrolledAt?`, `secret?`, `lastUsedStep?`.
- **`MfaReservation`** – Return shape of `reserveMfaAttempt`: whether a code may be compared and whether this call tripped the lock.
- **`OAuthAccount`** – One linked provider identity (`provider`, `providerId`, plus linkage metadata). Keyed on the provider's stable `sub`, not email.
- **Schema / `model()` export** – Applies `revisionPlugin`, `applySerialization`, a pre-save hook calling `hashPassword`, and `localeConfig` for any i18n-aware fields.

## Relationships

- **`src/infrastructure/security/password-hash.ts`** – Imported (`hashPassword`); called by the pre-save hook so `password` is always a scrypt digest at write time.
- **`src/infrastructure/persistence/revision-plugin.ts`** – Imported and applied to the schema; adds audit-revision tracking to every document.
- **`src/infrastructure/persistence/serialize.ts`** – Imported (`applySerialization`); wires Mongoose casting/serialization so `Date` fields round-trip correctly.
- **`src/infrastructure/i18n/config.ts`** – Imported (`localeConfig`); supplies locale settings used by schema fields or validation.
- **`src/modules/account/services/password.ts`** – Reads/writes `UserRecord.password` and the backup-code fields when setting or changing a password.
- **`src/modules/account/services/login.ts`** – Reads `password`, `twoFactorMethods`, `mfaFailures`, `mfaLockedUntil`, `tokensValidAfter` to authenticate and enforce 2FA.
- **`src/modules/account/services/oauth.ts`** – Sole writer of `UserRecord.oauthAccounts`; the signup branch may leave `password` absent.
- **`src/modules/account/services/email-change.ts`** – Writes `pendingEmail` / `previousEmail`; `applyEmailChange` swaps `email` and stores the prior value for undo.
- **`src/modules/account/services/account-deletion.ts`** – Sets `deletedAt`, `deletedBy: 'owner'`, `purgeAt` for self-service deletion; the reaper job sets `deletedBy: 'reaper'`.
- **`src/modules/account/services/logout.ts`** – May call `bumpSessionEpoch`, which advances `tokensValidAfter`.
- **`src/modules/account/services/password-reset-request.ts` / `password-reset.ts`** – Interact with `reauthCode` (for passwordless accounts) and `password` on reset.
- **`src/modules/account/services/caller.ts`** / **`deletion-sign-in.ts`** – Read user fields to establish the acting identity or validate a pending-deletion session.
- **`scripts/audit/compliance-rules.yaml`** – Declarative rules that reference user-record fields (e.g. `purgeAt`, `deletedBy`) for compliance reporting; does not import this file but constrains which fields may appear in audit outputs.

## Notes

- **`select: false` on sensitive fields** – `password`, `pendingEmail`, and `previousEmail` are excluded from every query by default. Any code that needs them must explicitly `.select('+password')` etc. Forgetting this is a silent data-loss bug, not an error.
- **`role` is deliberately absent** – The document has no role. Role is resolved via `@modules/access` membership rows. Any code that reads `user.role` off this document is reading `undefined`.
- **Date vs. ISO-string split** – The wire `User` contract uses ISO strings; the document uses `Date`. `UserRecord` redeclares the affected fields as `Date`. The fixture that originally surfaced this mismatch pinned `createdAt: string` and broke at runtime.
- **`mfaFailures` is a single counter** – It is shared across all armed 2FA methods in the current window. It is written only by `reserveMfaAttempt` / `resetMfaAttempts`; do not increment it ad-hoc.
- **`reauthCode` is not a 2FA factor** – It is a transient step-up code. It never appears in `twoFactorMethods`, is never armed, and is consumed in one comparison.
- **`purchaseHold` is retained after expiry** – Read its active state through `./services/purchase-hold`; the `until` field tells you when it lapses, but the record persists so `setAt` remains as the cancellation-count anchor.
- **One file, on purpose** – The module docblock warns that splitting the schema would separate the `hashPassword` hook from the `select: false` declaration. Resist refactors that extract fields into sub-schemas without relocating the hook.
