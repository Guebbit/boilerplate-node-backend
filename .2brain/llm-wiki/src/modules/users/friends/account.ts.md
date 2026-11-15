---
source: src/modules/users/friends/account.ts
sha256: ec467851bcb9ae061226b2a9181766b88648fcbbc5df084d52b63d9f0b4ae719
generated_at: 2026-11-14T22:22:06.264981+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/friends/account.ts

## Purpose

A friend-facing facade that bundles the specific `users`-domain functions the `account` module needs to authenticate, register, protect (2FA), change, and erase User documents. It exists so `account` can call these operations without importing the public `userService` barrel, and so tests can `jest.spyOn` the exact object the code under test receives.

## Key elements

- **`accountUserService`** (the sole export) — a plain object (not a spread) aggregating ~50 functions drawn from the `users` sub-services:
  - *Read / lookup:* `getById`, `findByEmail`, `findAuthenticatableById`, `findByIdWithCredentials`, `findForLogin`, `findByOAuthIdentity`, `findByIdWithPendingEmail`, `emailOrPendingEmailTaken`, `emailTaken`
  - *Signup / OAuth:* `registerSelfService`, `registerFromOAuth`, `buildSignupDecoy`, `linkOAuthAccount`, `unlinkOAuthAccount`
  - *Own-account lifecycle:* `updateOwnProfile`, `softDeleteInactive`, `eraseInactive`, `scheduleOwnDeletion`, `restoreOwnAccount`, `eraseScheduledDeletion`, `eraseAgain`, `restoreDeletionState`, `findDueScheduledDeletions`
  - *Credentials / 2FA / email:* `setPassword`, `markSessionsEnded`, `markEmailVerified`, `applyEmailChange`, `restorePreviousEmail`, `cancelPendingEmail`, `setPendingEmail`, `persistTwoFactorMethods`, `persistTwoFactorWrite`, `armReauthCode`, `spendDeliveredCode`, `recordDeliveredMiss`, `reserveMfaAttempt`, `resetMfaAttempts`, `claimTotpStep`, `spendBackupCode`, `bumpSessionEpoch`, `touchLastActive`, `clearLapsedPreviousEmail`, `clearDeliveredCode`, `markInactivityWarned`, `reencryptTwoFactorSecrets`
  - *Reaper / inactivity:* `findInactiveUnwarned`, `minimiseInactiveBefore`, `findWarnedStillInactive`, `findReaperSoftDeletedPastGrace`
  - *Misc:* `userAuditChanges`, `enqueueIfPending`, `toAccount` (aliased to `presentAccount`)

## Relationships

All listed neighbors live under `src/modules/account/` and **import** `accountUserService` from this file:

- **Controllers** (`delete-account.ts`, `post-signup.ts`, `update-account.ts`) call the relevant lifecycle/signup/erase functions through the facade.
- **Services** (`login.ts`, `logout.ts`, `oauth.ts`, `password.ts`, `password-reset-request.ts`, `email-change.ts`, `account-deletion.ts`, `erasure-ledger.ts`, `export.ts`, `export-job.ts`, `caller.ts`) invoke credential, lookup, 2FA, and email functions via the same object.
- **`module.ts`** wires the above together at the module-registration level.

This file does **not** import from any `account` file; the dependency is strictly one-way (`account` → this facade → `users` sub-services).

## Notes

- **No internal checks.** Every function in the object trusts that `account` has already validated the caller. Calling them from outside `account` bypasses authorization.
- **Lint-enforced boundary.** Only `account` may import this file; `account` must not import `userService` (the public barrel). A barrel must not re-export `accountUserService`.
- **Spy-friendly by design.** The object is a literal, not a spread, so `jest.spyOn(accountUserService, 'fn')` intercepts calls made through the same reference. A spread would decouple the spy from the live binding.
- **`toAccount` lives here on purpose.** The public barrel never exposes `presentAccount`; the friend object is the sole sanctioned path for `account` to serialise a user into its account representation.
- Refer to `docs/theory/strategic-ddd.md` §5 and `docs/modules/users.md` for the broader friend-pattern rationale.
