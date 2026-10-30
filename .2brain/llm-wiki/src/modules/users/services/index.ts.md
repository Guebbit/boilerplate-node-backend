---
source: src/modules/users/services/index.ts
sha256: 4fb591564350785660cd05af55c4869197bfaf58718079e8e0d817c90a008fa0
generated_at: 2026-10-29T06:16:37.132498+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/users/services/index.ts

## Purpose

Barrel and public-surface file for the **users** domain service. It re-exports every sub-module (read, credentials, signup, reaper, purchase-hold, etc.) and bundles them into a single `userService` object. The `account` module's controllers and services call through this object; they never import the individual sub-files directly.

## Key elements

- **`userService`** (const object, default public API) — flat namespace of ~65 functions covering:
  - CRUD & search: `create`, `getById`, `updateById`, `removeById`, `restoreById`, `search`, `staffContacts`, `findByEmail`
  - Signup / OAuth: `registerSelfService`, `registerFromOAuth`, `buildSignupDecoy`, `linkOAuthAccount`, `unlinkOAuthAccount`
  - Credentials & 2FA: `setPassword`, `markSessionsEnded`, `persistTwoFactorMethods`, `armReauthCode`, `spendDeliveredCode`, `reserveMfaAttempt`, `claimTotpStep`, `spendBackupCode`, `bumpSessionEpoch`, etc.
  - Email lifecycle: `markEmailVerified`, `applyEmailChange`, `restorePreviousEmail`, `cancelPendingEmail`, `clearLapsedPreviousEmail`
  - Purchase holds: `setPurchaseHold`, `liftPurchaseHold`, `takeAutomaticPurchaseHold`, `flagPurchaseHoldReview`, `purchaseHoldOf`, `purchaseHoldCountingSince`
  - Own-account / scheduled deletion: `updateOwnProfile`, `scheduleOwnDeletion`, `restoreOwnAccount`, `eraseScheduledDeletion`, `findDueScheduledDeletions`, `softDeleteInactive`, `eraseInactive`
  - Reaper queries: `findInactiveUnwarned`, `minimiseInactive`, `findReaperSoftDeletedPastGrace`, etc.
  - Auth lookups: `findAuthenticatableById`, `findForLogin`, `findByOAuthIdentity`, `emailTaken`, `emailOrPendingEmailTaken`
  - Misc: `reencryptUserPhones`, `reencryptTwoFactorSecrets`, `exportSignInMethods`, `userAuditChanges`, `enqueueIfPending`, `toAccount` (alias for `presentAccount`)
- **Re-exported types**: `TwoFactorSecretRing`, `ActivePurchaseHold`, `StaffContact`
- **Re-exported predicates**: `isAuthenticatable`, `isRestorable` (from `../authenticatable`)
- **Re-exported helper**: `personalDataSubjectOf` (from `./personal-data-subject`)

## Relationships

All graph neighbors live under `src/modules/account/` and consume `userService`:

- **Controllers** (`post-signup.ts`, `update-account.ts`, `get-account.ts`, `delete-account.ts`) call `userService` methods to perform the domain mutations and reads behind each HTTP endpoint.
- **Account services** (`login.ts`, `logout.ts`, `oauth.ts`, `password.ts`, `password-reset-request.ts`, `email-change.ts`, `account-deletion.ts`, `export.ts`, `export-job.ts`, `caller.ts`) orchestrate HTTP/session/email concerns and delegate the document-level work to `userService` (e.g. `findForLogin`, `setPassword`, `applyEmailChange`, `exportSignInMethods`).
- **`account/module.ts`** wires the account module's providers and likely registers `userService` (or the individual account services that wrap it) into the DI container.

Internally, this file imports from sibling sub-modules in `src/modules/users/services/` (`./read`, `./credentials`, `./signup`, `./reaper`, `./purchase-hold`, `./own-account`, `./lookups`, `./activation`, `./create`, `./update`, `./remove`, `./image`, `./reencrypt`, `./sign-in-methods`, `./audit-changes`) and from `../presenter` / `../authenticatable`.

## Notes

- **No raw `update` / `remove`**: the barrel deliberately withholds the bare write functions. Only the role-gated variants (`updateById`, `removeById`, `activate`, `deactivate`) or the named owner/reaper doors (`updateOwnProfile`, `softDeleteInactive`, `eraseInactive`, …) are exposed.
- **`toAccount` is an intentional alias**: the barrel does not re-export presenter functions as standalone symbols; `presentAccount` is reachable only as `userService.toAccount`. Any sibling that needs to shape a response should go through this alias rather than importing `../presenter` directly.
- **One file per flow** convention (see `docs/theory/layers.md`): each sub-module is a single flow; this index is purely aggregation, no logic.
- Domain primitives vs. flows: this service enforces what the **User document** requires; transport concerns (HTTP, sessions, emails, rate limits, anti-automation) belong to the `account` module.
