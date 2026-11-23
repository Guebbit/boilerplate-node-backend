---
source: src/modules/account/tests/integration/email-change-lapse.test.ts
source_sha256: 07cde0fa858cd5e91f66ea10c66e10aa3eed000deffc32305bb3b4c5bedfdab1
context_sha256: 42476165c252a4137eb5d52007be446497b1e375d042c1aefd45c11be9e80d90
generated_at: 2026-11-22T03:54:29.244850+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/email-change-lapse.test.ts

## Purpose
Integration tests for `accountService.reapLapsedPreviousEmails()`, the nightly sweep that ends the `changed` state of an email change. An account's `previousEmail` is cleared exactly when it holds a previous address and has no live undo token (type `email-change-undo`), since the undo link is the undo window.

## Key elements
- `setupTestDb()` — called at module level to prepare the test database.
- `UNDO` — constant `'email-change-undo'`, the `verificationtokens.type` of the undo link. It is spelled out so a rename breaks this suite.
- `changedAccount(username, undoTtlMs?)` — creates a user, sets `previousEmail` to `<username>-old@example.com`, and optionally plants an undo token. A negative TTL means an already-expired link, and `undefined` means no link.
- `previousEmailOf(id)` — reads the stored `previousEmail` through `userRepository.findByIdWithCredentials`. Returns `undefined` once cleared.
- Test cases in `describe('reapLapsedPreviousEmails')`:
  - An expired undo link clears the previous email, and the sweep resolves to `1`.
  - A missing link (spent or revoked) clears it.
  - A live link keeps it, and the sweep resolves to `0`.
  - A live token of another type (`email-change`) does not protect it.
  - The current `email` and any `pendingEmail` are left untouched.

## Relationships
- `@modules/account/services` — supplies `accountService`, whose `reapLapsedPreviousEmails` is under test.
- `../factories` (`src/modules/account/tests/factories.ts`) — supplies `plantToken(userId, type, value, { ttlMs })` for creating verification tokens.
- `@modules/users/tests/factories` — supplies `createUser`, and exposes `userRepository`.
- `src/modules/users/repository.ts` — the repository behind `userRepository`, used for `updateMany` and `findByIdWithCredentials`.
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`) — supplies `setupTestDb`.

## Notes
- Tests write `previousEmail` and `pendingEmail` directly with `userRepository.updateMany`, bypassing the service.
- The return value of `reapLapsedPreviousEmails()` is the count of accounts cleared. Only the first and third tests assert it.
