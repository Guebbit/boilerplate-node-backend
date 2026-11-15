---
source: src/modules/users/model.ts
sha256: 66080bdf0f1dfce4098a56124a19c5cf61e2b3dc036d4a1ea9a22e292975e1a8
generated_at: 2026-11-14T22:23:11.317875+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/model.ts

## Purpose

Defines the Mongoose schema and document interfaces for the user record. It is intentionally a single file: the pre-save password-hashing hook and the `select: false` fields that guard sensitive data (password, pending/previous email) must stay colocated so a future split can't accidentally separate them.

## Key elements

- **`UserRecord`** – The document-level interface. Extends the wire `User` contract but redeclares ISO-string date fields as real `Date`, adds document-only fields (`password`, `deletedBy`, `purgeAt`, `inactivityWarnedAt`, `inactivityMinimisedAt`, `lastActiveAt`, `lastApiKeyUseAt`, `tokensValidAfter`, `mfaLockedUntil`, `authenticatorEnabledAt`, `purchaseHoldResetAt`, `purchaseHoldFlaggedAt`, etc.), and deliberately omits `role` (lives in `@modules/access` membership rows).
- **`PurchaseHoldRecord`** – Shape of a protective checkout pause (`until`, `reason`, `note`, `setBy`, `setAt`).
- **`DeliveredCodeState`** / **`DELIVERED_CODE_FIELDS`** – The four fields (`codeHash`, `codeExpiresAt`, `codeSentAt`, `codeAttempts`) shared by a 2FA method's in-flight code and the step-up `reauthCode`, so `delivered-codes.ts` applies one set of rules to both.
- **`DeliveredCodeSlot`** – Discriminated union (`'reauth' | 'method'`) the users "door" uses to target the right fields in a single conditional write.
- **`TwoFactorMethodRecord`** – One enrolled or half-enrolled second factor. Extends `DeliveredCodeState` with `method`, `enrolledAt`, `secret` (TOTP), and `lastUsedStep` (replay protection).
- **`MfaReservation`** – Return shape of `reserveMfaAttempt`: `reserved` (may compare?) and `lockedNow` (this caller triggered the lock and should notify the owner).
- **`OAuthAccount`** – One linked provider identity (`provider`, `providerId`, …). A user may hold several.
- **Mongoose `model` export** – The compiled schema with: pre-save `hashPassword` hook, `revisionPlugin`, `applySerialization`, and `canonicalLocaleSetter` applied to the locale field.

## Relationships

- **`src/infrastructure/security/password-hash.ts`** – `hashPassword` is called by the pre-save hook; the hook runs before any document reaches Mongo.
- **`src/infrastructure/i18n/config.ts`** – `localeConfig` supplies the valid-locale set the schema validates against.
- **`src/infrastructure/i18n/index.ts`** – `canonicalLocaleSetter` is applied as a schema setter to normalise the user's locale tag.
- **`src/infrastructure/persistence/revision-plugin.ts`** – `revisionPlugin` is applied to the schema to track document revisions.
- **`src/infrastructure/persistence/serialize.ts`** – `applySerialization` is applied to handle document → wire serialisation.
- **`src/modules/account/services/oauth.ts`** – The sole writer of `OAuthAccount` entries; its signup branch is the path where `password` is absent.
- **`src/modules/account/services/email-change.ts`** – Reads/writes `pendingEmail` and `previousEmail`; both are `select: false` for the same reason as `password`.
- **`src/modules/account/services/login.ts`** – Consumes `password`, `mfaFailures`, `mfaLockedUntil`, `tokensValidAfter`, and `twoFactorMethods` during authentication.
- **`src/modules/account/services/account-deletion.ts`** – Writes `deletedBy: 'owner'` and `purgeAt` on owner-initiated `DELETE /account`.
- **`scripts/audit/compliance-rules.yaml`** – References user-record field names for data-classification and retention rules.

## Notes

- **`role` is absent by design.** Nothing in this document reads or writes a role. The `@modules/access` module's membership rows are the single source of truth, and `presentUser` in `./presenter` takes the caller's role as an explicit parameter.
- **`select: false` on sensitive fields.** `password`, `pendingEmail`, and `previousEmail` require an explicit `.select()` to appear in a query result. Do not assume they are present in a hydrated document.
- **ISO-string vs `Date`.** The wire `User` contract uses ISO strings for all timestamps; the document uses real `Date` objects (written by `timestamps: true` or explicit writes). `UserRecord` redeclares these fields as `Date`. A fixture that pins a string where a `Date` is expected will surface the mismatch at type-check time.
- **`purgeAt` is stored, not derived.** Changing the grace-period configuration does not retroactively move a date already promised to the user.
- **`deletedBy` is a two-value enum (`'reaper' | 'owner'`).** The hard-delete stage of `reap:inactive-accounts` may only erase records it soft-deleted itself (`'reaper'`). An owner-scheduled purge (`'owner'`) follows its own `purgeAt` clock.
- **One file on purpose.** The module doc comment states that splitting would risk separating the password-hash hook from the `select: false` declaration. Resist refactoring it into a multi-file schema builder.
