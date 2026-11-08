---
source: src/modules/users/services/index.ts
sha256: aad2bb73f539158266967f95a5a116a3e93337649d30be0d0cbe5b734f2bf62c
generated_at: 2026-11-08T08:49:43.625264+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/index.ts

## Purpose

Barrel/index file for the users service. It aggregates every sub-module function (read, credentials, signup, purchase-hold, reaper, etc.) into a single `userService` object that serves as the **only** public API surface for the User domain. Controllers and account services call through this object and never import the bare sub-module functions directly.

## Key elements

- **`userService`** — the sole object export. ~65 named methods grouped by concern:
  - *Read/search:* `search`, `getById`, `staffContacts`, `findByEmail`, `emailTaken`, `findAuthenticatableById`, `findByIdWithCredentials`, `findForLogin`, `findByOAuthIdentity`, `findByIdWithPendingEmail`, `emailOrPendingEmailTaken`
  - *Lifecycle (staff-gated):* `create`, `updateById`, `activate`, `deactivate`, `removeById`, `restoreById`
  - *Self-service / own-account:* `updateOwnProfile`, `scheduleOwnDeletion`, `restoreOwnAccount`, `eraseScheduledDeletion`, `eraseAgain`, `restoreDeletionState`, `findDueScheduledDeletions`
  - *Inactivity reaper:* `softDeleteInactive`, `eraseInactive`, `findInactiveUnwarned`, `minimiseInactive`, `findReaperSoftDeletedPastGrace`, etc.
  - *Credentials / 2FA:* `setPassword`, `markSessionsEnded`, `armReauthCode`, `spendDeliveredCode`, `persistTwoFactorMethods`, `claimTotpStep`, `spendBackupCode`, `bumpSessionEpoch`, `reserveMfaAttempt`, `resetMfaAttempts`, `touchLastActive`, `touchApiKeyUse`, `clearLapsedPreviousEmail`, `clearDeliveredCode`
  - *Email change:* `markEmailVerified`, `applyEmailChange`, `restorePreviousEmail`, `cancelPendingEmail`, `markInactivityWarned`
  - *Signup / OAuth:* `registerSelfService`, `registerFromOAuth`, `buildSignupDecoy`, `linkOAuthAccount`, `unlinkOAuthAccount`
  - *Purchase holds:* `setPurchaseHold`, `liftPurchaseHold`, `purchaseHoldOf`, `takeAutomaticPurchaseHold`, `flagPurchaseHoldReview`
  - *Ops / re-encryption / export:* `reencryptUserPhones`, `reencryptTwoFactorSecrets`, `exportSignInMethods`, `userAuditChanges`, `enqueueIfPending`
  - *Presentation:* `toAccount` (aliased from `presentAccount`), `toUserContract`, `toUserContracts`
- **Direct re-exports (not behind `userService`):** `isAuthenticatable`, `isRestorable`, `personalDataSubjectOf`, and the types `TwoFactorSecretRing`, `ActivePurchaseHold`, `StaffContact`.

## Relationships

- **Account controllers** (`delete-account.ts`, `post-signup.ts`, `update-account.ts`) import `userService` and call its methods for all User-document mutations and reads.
- **Account services** (`login.ts`, `oauth.ts`, `password.ts`, `email-change.ts`, `account-deletion.ts`, `export.ts`, `export-job.ts`, `logout.ts`, `password-reset-request.ts`, `erasure-ledger.ts`, `caller.ts`) consume specific `userService` methods (e.g. `setPassword`, `findByOAuthIdentity`, `applyEmailChange`, `eraseInactive`, `exportSignInMethods`) to perform their flow-specific logic while delegating all document-level work here.
- **`src/modules/account/module.ts`** wires the controllers and services together; it does not import this barrel directly but the services it registers do.

## Notes

- The raw low-level `update` and `remove` functions are **deliberately not exposed** on `userService`. All mutations go through the higher-level named doors (`updateById`, `removeById`, `updateOwnProfile`, `softDeleteInactive`, `eraseInactive`, etc.) so the staff-role / ownership check is enforced before the document is loaded.
- `toAccount` exists as a workaround: the barrel "never publishes a presenter function," so a sibling that needs to shape an account for an HTTP response reaches `presentAccount` via the service object instead.
- Architectural boundary (per header comment): this file enforces only what the User *document* requires. HTTP routing, sessions, email sending, rate-limiting, and anti-automation all live in the `account` module.
- Follows the "one file per flow" convention documented in `docs/theory/layers.md`; this index is purely a re-export/aggregation with no business logic.
