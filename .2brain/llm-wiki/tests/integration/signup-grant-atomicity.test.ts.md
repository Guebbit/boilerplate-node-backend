---
source: tests/integration/signup-grant-atomicity.test.ts
sha256: 99f1e02c22ecbd95da113438cfbea620588fc740afa9685056192bd78a6397b9
generated_at: 2026-10-15T12:54:36.873265+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/signup-grant-atomicity.test.ts

## Purpose

Verifies that self-service signup and OAuth signup write the `User` row and its starting membership atomically. Each test forces the membership grant to fail and asserts no `User` row is left behind, so the email/identity can retry signup. Pairs of tests additionally break the compensating delete to confirm the transaction itself (not the fallback undo) prevents orthon persistence. Lives in `tests/integration/` rather than either module's own `tests/` because the failure spans `account` (writes the user) and `access` (grants membership).

## Key elements

- **`failMembershipWritesWith(failure)`** — local helper; spies on `membershipModel.findOneAndUpdate` and returns a stub whose `exec()` rejects, simulating a grant failure.
- **`failUserDeletes()`** — local helper; spies on `userRepository.deleteOne` and rejects, simulating a failed compensating delete.
- **`describe('self-service signup')`** — asserts `accountService.signup` returns a `ResponseReject` and no user row remains.
- **`describe('self-service signup, with nothing to undo it')`** — same, but also breaks `deleteOne`; still expects no row.
- **`describe('OAuth signup')`** — asserts `accountService.loginOrCreateFromOAuth` rejects and no user row remains.
- **`describe('OAuth signup, with nothing to undo it')`** — same, with `deleteOne` also broken.

## Relationships

- **`src/modules/account/index.ts`** — imports `accountService`; the service under test whose `signup` and `loginOrCreateFromOAuth` methods are exercised.
- **`src/modules/access/model.ts`** — imports `membershipModel`; its `findOneAndUpdate` is the function mocked to simulate grant failure.
- **`src/modules/users/tests/factories.ts`** — imports `userRepository` and `PLAIN_PASSWORD`; the repository is both spied on (for delete-failure) and queried (to assert absence of the row).
- **`src/infrastructure/http/response.ts`** — imports the `ResponseReject` type for casting the failure response in assertions.
- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` to provision a clean test database.
- **`tests/support/callers.ts`** — imports `testCallerContext` to supply a valid caller to the service methods.
- **`tests/support/stub.ts`** — imports `asStub` to shape the mock return value for `membershipModel.findOneAndUpdate`.
- **`src/modules/account/services/index.ts`** — the internal service implementation that `accountService` delegates to; the transaction and compensating-undo logic lives here.
- **`src/modules/users/repository.ts`** — the underlying repository that `userRepository` (from factories) wraps; the `deleteOne` and `findOne` calls hit this.

## Notes

- The file is intentionally placed at the integration level: the failure path crosses the `account` → `access` module boundary, so neither module's own test suite covers it.
- The "with nothing to undo it" variants are not testing that the delete *succeeds*; they assert the row is absent even when the compensating delete is broken, implying the primary guarantee is the surrounding transaction rollback, not the explicit delete.
- `asStub` (from `tests/support/stub`) is used to satisfy TypeScript's structural typing on the mocked `findOneAndUpdate` return without constructing a real Mongoose query object.
