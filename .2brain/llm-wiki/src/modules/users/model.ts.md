---
source: src/modules/users/model.ts
sha256: 6a3bdc55eb169674bbd401e9954488e6f4fffa356750243d9482c795da559f7d
generated_at: 2026-10-29T06:13:24.219657+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/model.ts

## Purpose

Defines the Mongoose record shape (`UserRecord`) and its supporting subdocument interfaces for the user collection. It intentionally lives in a single file so the `pre-save` password-hash hook and the `select: false` guard on `password` (and `pendingEmail`/`previousEmail`) cannot be separated. The interface bridges the wire `User` contract (ISO-string dates, no internal fields) and the stored document (real `Date`s, internal-only columns).

## Key elements

- **`UserRecord`** — Extends `Omit<User, …>` with every internal-only field: `password?`, `deletedAt`, `deletedBy`, `purgeAt`, `lastActiveAt`, `lastApiKeyUseAt`, `inactivityWarnedAt`, `inactivityMinimisedAt`, `twoFactorMethods`, `reauthCode`, `mfaFailures`, `tokensValidAfter`, `mfaLockedUntil`, `twoFactorBackupCodes`, `twoFactorBackupCodeSalt`, `authenticatorEnabledAt`, `purchaseHold`, `purchaseHoldResetAt`, `purchaseHoldFlaggedAt`, `oauthAccounts`, `pendingEmail`, `previousEmail`, and redeclared `Date` fields (`createdAt`, `updatedAt`, `verifiedAt`, `analyticsConsentAt`, `termsAcceptedAt`, `twoFactorEnabledAt`). `role` is explicitly excluded — it belongs to `@modules/access`.
- **`PurchaseHoldRecord`** — Subdocument for a checkout pause (`until`, `reason`, optional `note`/`setBy`, `setAt`).
- **`DeliveredCodeState`** — Four-field shape (`codeHash`, `codeExpiresAt`, `codeSentAt`, `codeAttempts`) shared by a 2FA method entry and the step-up `reauthCode`.
- **`DELIVERED_CODE_FIELDS`** — Const tuple of the four field names above, used by the users "door" for conditional writes.
- **`DeliveredCodeSlot`** — Discriminated union (`'reauth'` | `'method'`) telling the writer which subdocument holds the code.
- **`TwoFactorMethodRecord`** — Extends `DeliveredCodeState`; adds `method`, `enrolledAt?`, `secret?`, `lastUsedStep?`. One shape for all 2FA channels.
- **`MfaReservation`** — Return shape of `reserveMfaAttempt`: `reserved` (may compare?) and `lockedNow` (this caller tripped the lock).
- **`OAuthAccount`** — `{ provider, providerId, … }` for a linked OIDC identity; `providerId` (not email) is the stable key.

## Relationships

- **`@infrastructure/security/password-hash`** — `hashPassword` is the pre-save hook that digests `password` before it reaches Mongo.
- **`@infrastructure/i18n/config`** — `localeConfig` is imported for use in the schema definition (truncated portion).
- **`@infrastructure/persistence/revision-plugin`** — `revisionPlugin` is applied to the schema for document revision tracking.
- **`@infrastructure/persistence/serialize`** — `applySerialization` is applied to the schema for consistent output formatting.
- **`@types` (`User`, `PurchaseHoldReason`)** — `UserRecord` is derived from the wire `User` contract; `PurchaseHoldReason` is the enum used in `PurchaseHoldRecord.reason`.
- **`account/services/oauth.ts`** — Sole writer of `oauthAccounts`; the OAuth-only signup branch leaves `password` absent.
- **`account/services/email-change.ts`** — Writes `pendingEmail` and `previousEmail`; the undo path restores from `previousEmail`.
- **`account/services/password-reset-request.ts` / `password-reset.ts` / `password.ts`** — Read/write `password` and may touch `reauthCode`.
- **`account/services/login.ts`** — Reads `password`, `tokensValidAfter`, `mfaFailures`, `mfaLockedUntil`, `twoFactorMethods` during sign-in.
- **`account/services/account-deletion.ts`** — Stamps `deletedAt`, `deletedBy`, `purgeAt` (or clears them on restore).
- **`shared/contracts/openapi.root.yaml`** — Source of the wire `User` type that `UserRecord` extends via `Omit`.

## Notes

- **ISO-string vs. `Date` mismatch:** The wire contract carries ISO strings for every timestamp; the Mongoose document stores real `Date` objects (written by `timestamps: true` or by service code). `UserRecord` redeclares each affected field as `Date`. A fixture that pinned `createdAt: string` previously surfaced this drift — keep the redeclarations in sync if the contract changes.
- **`select: false` coupling:** `password`, `pendingEmail`, and `previousEmail` are excluded from every default read by Mongoose. The pre-save hook that hashes `password` and the `select: false` option must remain in the same schema definition — splitting the model across files risks one being lost.
- **No `role` field:** The user document deliberately carries no role. All role reads/writes go through `@modules/access` membership rows. `presentUser` in `./presenter` takes the caller's role as an explicit parameter.
- **`deletedBy` discriminant:** `'reaper'` soft-deletes may be hard-erased by the reaper's second stage; `'owner'` soft-deletes carry a `purgeAt` deadline and are only erased after it passes. A restore clears both.
- **`purchaseHold` outlives expiry:** The subdocument is kept after `until` passes so `setAt` still anchors the cancellation-count reset. "Active" is a computed predicate (`until > now`), not a stored flag.
- **`mfaFailures` is per-account, not per-method:** One counter covers all typed codes across every armed factor in the current window; `reserveMfaAttempt` / `resetMfaAttempts` are the only writers.
