---
source: src/modules/account/tests/integration/email-change-lapse.test.ts
sha256: 07cde0fa858cd5e91f66ea10c66e10aa3eed000deffc32305bb3b4c5bedfdab1
generated_at: 2026-10-29T02:55:06.651424+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/email-change-lapse.test.ts

## Purpose

Integration tests for the nightly sweep `reapLapsedPreviousEmails`, which clears a user's `previousEmail` field once the undo token that would restore it is either expired or entirely absent. The suite verifies the sweep's boundary conditions: it acts only on lapsed or missing undo tokens, ignores other token types, and never touches the current email or a pending change.

## Key elements

- **`UNDO`** — constant `'email-change-undo'`; the exact `verificationtokens.type` string for the undo link. Spelled out (not imported from a shared const) so a rename surfaces as a loud test failure.
- **`changedAccount(username, undoTtlMs?)`** — sets up a user with a `previousEmail` already stored; optionally plants an undo token with the given TTL (negative = already expired, `undefined` = no token). Returns the created user.
- **`previousEmailOf(id)`** — reads back the stored `previousEmail` via `userRepository.findByIdWithCredentials`; resolves `undefined` when cleared.
- **`describe('reapLapsedPreviousEmails')`** — five test cases covering: expired token → cleared; missing token → cleared; live token → preserved; live token of a *different* type → still cleared; and a `pendingEmail` / current `email` left untouched by the sweep.

## Relationships

- **`src/modules/account/services/index.ts`** — imports `accountService`, whose `reapLapsedPreviousEmails()` method is the sole system under test.
- **`src/modules/account/tests/factories.ts`** — provides `plantToken` used to seed verification tokens (undo and other types) with controlled TTLs.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` for provisioning fresh users and `userRepository` for direct DB updates and assertions.
- **`src/modules/users/repository.ts`** — `userRepository` is used both to set `previousEmail`/`pendingEmail` in fixtures and to read stored credentials in assertions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory (or temp) database before the suite runs.

## Notes

- The sweep's return value is asserted as a count (`toBe(1)`, `toBe(0)`) rather than just checking side-effects, which couples the test to the implementation's "number of rows updated" contract.
- The "not fooled by a live token of another type" test confirms the sweep filters on the exact `type` string; any future rename of the undo token type without updating `UNDO` here will break the suite intentionally.
- `changedAccount` uses `userRepository.updateMany` (not a service method) to set `previousEmail`, deliberately bypassing the domain layer to simulate a post-change state.
