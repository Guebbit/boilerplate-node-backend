---
source: src/modules/account/tests/integration/email-change-lapse.test.ts
sha256: 07cde0fa858cd5e91f66ea10c66e10aa3eed000deffc32305bb3b4c5bedfdab1
generated_at: 2026-11-08T04:35:51.322376+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/email-change-lapse.test.ts

## Purpose

Integration tests for `accountService.reapLapsedPreviousEmails()`, the nightly sweep that clears a user's `previousEmail` field once its undo link is no longer restorable. The file locks down the exact boundary condition: a previous address is forgotten **iff** it exists **and** no live `email-change-undo` token remains.

## Key elements

- **`UNDO`** — constant holding the token-type string `'email-change-undo'`, deliberately spelled out so a rename in production code fails this suite loudly.
- **`changedAccount(username, undoTtlMs?)`** — helper that creates a user, stamps a `previousEmail`, and optionally plants an undo token. A negative `undoTtlMs` simulates an already-expired link; `undefined` means no link at all.
- **`previousEmailOf(id)`** — helper that reads the stored `previousEmail` (or `undefined`) via `userRepository.findByIdWithCredentials`.
- **`describe('reapLapsedPreviousEmails')`** — five cases covering: expired link, absent link, live link (address retained), a live token of a *different* type (`email-change`), and a user with a pending email change (neither `email` nor `pendingEmail` is touched).

## Relationships

- **`src/modules/account/services/index.ts`** — imports `accountService`; the SUT is its `reapLapsedPreviousEmails()` method.
- **`src/modules/account/tests/factories.ts`** — imports `plantToken` to create verification tokens of the `UNDO` or other types.
- **`src/modules/users/tests/factories.ts`** — imports `createUser` for test-fixture user creation.
- **`src/modules/users/repository.ts`** — imports `userRepository` for direct `updateMany` (stamping `previousEmail` / `pendingEmail`) and `findByIdWithCredentials` (assertions).
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb` and calls it at module top-level to initialise the test database.

## Notes

- The sweep return value is asserted: it resolves to the **count** of rows cleared (`1` in the first test, `0` when the link is still live). Callers that rely on a boolean will not match this contract.
- The "another type" test uses `'email-change'` (the confirmation token) to prove the sweep is scoped to the undo type specifically, not "any live token."
- All DB access in assertions goes through `userRepository.findByIdWithCredentials`, not the service, to avoid coupling the assertion to service-layer transforms.
