---
source: src/modules/users/tests/integration/sign-in-methods.test.ts
sha256: d0b8de83e305e7b521fda06f278db2ac34402d44638d84a9c4c2d365ca2ba5d7
generated_at: 2026-11-08T08:57:35.914562+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/sign-in-methods.test.ts

## Purpose

Integration test for `userService.exportSignInMethods`. It verifies that the export section returns only the linked OAuth providers and the armed second-factor methods as opaque facts (method + enrollment date), and that it never leaks secrets, in-flight codes, or backup-code digests. It also pins the behavior for edge cases: unconfirmed factors, password-only accounts, and deleted users.

## Key elements

- **`setupTestDb()`** — bootstraps a real (non-mocked) database so the test exercises the full repository → service path.
- **`LINKED_AT` / `ARMED_AT`** — fixed `Date` constants used so the ISO-string assertions in `toEqual` are exact and deterministic.
- **`describe('userService.exportSignInMethods', …)`** — the test suite containing four cases:
  - *Lists linked providers and armed factors, and nothing that opens them* — asserts the happy-path shape: `providers[]` with `provider`/`providerId`/`connectedAt` and `twoFactor[]` with only `method`/`enrolledAt`, no secret, no code fields, no backup codes.
  - *Leaves out a factor whose setup was never confirmed* — a factor lacking `enrolledAt` is excluded entirely.
  - *Answers empty lists for a password-only account* — both arrays are `[]`.
  - *Answers nothing for a gone account* — returns `undefined`, signalling the export assembler should omit the section.

## Relationships

- **`src/modules/users/services/index.ts`** — imports `userService`; calls `exportSignInMethods` (the SUT).
- **`src/modules/users/tests/factories.ts`** — imports `createUser` and `userRepository`; `createUser` seeds the user document, `userRepository.linkOAuthAccount` attaches the OAuth provider row.
- **`tests/support/setup-test-db.ts`** — imports and calls `setupTestDb()` to provision the integration database before the suite runs.
- **`src/modules/users/repository.ts`** — reached indirectly through the `userRepository` factory for the `linkOAuthAccount` call; the service under test also reads from this repository internally.

## Notes

- This is an **integration** test: no mocks on the repository. The service reads from the same DB the factory wrote to.
- The "unconfirmed factor" case encodes a domain rule: a factor without `enrolledAt` is not yet armed and must not appear in the export.
- The "gone account" test passes a hardcoded 24-char hex string as the user ID rather than creating-then-deleting, so it exercises the not-found branch without a teardown.
- The module doc-comment states the security intent explicitly: the export is a *what-is-linked* fact sheet, never a *how-to-open* credential dump.
