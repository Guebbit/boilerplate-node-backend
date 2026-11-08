---
source: src/modules/users/tests/integration/external-key-lookups.test.ts
sha256: 5a167226cd59a6edd3c6ec1d93517fe0c22fde3042c473aaf389369722c410d7
generated_at: 2026-11-08T08:54:20.038240+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/external-key-lookups.test.ts

## Purpose

Integration tests verifying that every external-key lookup (email, federated OAuth subject) rejects a query operator injected in place of a plain string, producing a cast failure rather than a wide match. This guards against the case where upstream sanitization (Zod) is bypassed and a raw operator reaches the persistence layer.

## Key elements

- **`operatorAsString()`** — Returns `JSON.parse('{"$ne": null}') as string`, simulating an unsanitized query operator arriving where a string type is declared.
- **`CAST_FAILURE`** — Regex (`/Cast to string failed/u`) matching the expected rejection error from the string-type path.
- **`describe('external-key lookups')`** — Suite containing eight tests covering:
  - Raw repository lookup with the operator *does* match (demonstrates the vulnerability).
  - `userService.findForLogin` rejects the operator; still resolves a real email.
  - `userService.findByEmail` rejects the operator.
  - `userService.emailTaken` rejects the operator; still detects a taken email.
  - `userService.emailOrPendingEmailTaken` rejects the operator; still detects a taken email.
  - `userService.findByOAuthIdentity` rejects the operator in the subject slot; still resolves a real `sub-1`.
  - A banned (`active: false`) account is excluded from `findForLogin` while still present in the DB.
- **`beforeEach`** — Creates a user (`real@example.com`, username `real`) and links a Google OAuth account (`sub-1`) via `userRepository.linkOAuthAccount`.

## Relationships

- **`src/modules/users/repository.ts`** — Imports `userRepository` directly to demonstrate the raw operator match (first test) and to assert a banned account still exists at the DB level.
- **`src/modules/users/services/index.ts`** — Imports `userService`; every service-level lookup tested (`findForLogin`, `findByEmail`, `emailTaken`, `emailOrPendingEmailTaken`, `findByOAuthIdentity`) is exercised here.
- **`src/modules/users/tests/factories.ts`** — Imports `createUser` to seed the user records (real, banned) used across the suite.
- **`tests/support/setup-test-db.ts`** — Calls `setupTestDb()` at module load to initialize the in-memory/ephemeral database for the file.

## Notes

- The first test is intentionally a *negative control*: it shows the operator *would* match if it reached the repository unsanitized. It does not test a service method.
- The `as string` cast in `operatorAsString()` is the whole point of the file — it replicates the type-erasure a deserialized JSON operator would undergo, so the test validates the runtime type-check, not the compile-time one.
- All rejection assertions use `rejects.toThrow(CAST_FAILURE)`, meaning the expected failure mode is a thrown error (not a silent empty result).
- The banned-account test uses a zero-padded 24-char string (`'0'.repeat(24)`) as a valid ObjectId for the pending-email parameter, avoiding any coupling to a real ID.
