---
source: src/modules/account/tests/integration/reset-terms.test.ts
sha256: c8eccdcee94aa36dbf728b331952fcf00f190e9b2eb4e4c279e1fd7786e9fd15
generated_at: 2026-11-14T19:08:13.228233+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/reset-terms.test.ts

## Purpose

Integration tests for the Terms-of-service record stamped during the password-reset confirm path. An account created by staff holds no Terms record, so the holder's first `completePasswordReset` call is where one is created. The file exercises both the service method and the HTTP route, verifying validation, version stamping, and idempotency when a record already exists.

## Key elements

- **`fieldsOf(errors)`** – Extracts the `details.field` value from a 422 error array so assertions can name the offending field directly.
- **`confirm(link, termsAccepted?)`** – Thin wrapper around `accountService.completePasswordReset` that supplies the replacement password and `testCallerContext`, returning the raw service result.
- **`describe('completePasswordReset, an account with no Terms record')`** – Service-level tests: 422 when `termsAccepted` is missing (link remains reusable), version stamped from `NODE_TERMS_VERSION` in the same write as the password, and dead-link errors that never surface the terms field.
- **`describe('completePasswordReset, an account that already accepted')`** – Confirms an existing `termsAcceptedAt`/`termsVersion` pair is left untouched on a subsequent reset.
- **`describe('POST /account/password/reset/confirm, …')`** – Route-level tests via `api()`: the `termsAccepted: true` body field is required (204 on success, 422 without), and `termsAccepted: false` is explicitly rejected.

## Relationships

- **`src/modules/account/services/index.ts`** — Imports `accountService` to call `completePasswordReset` at the service level.
- **`src/modules/account/tests/factories.ts`** — Imports `plantToken` to seed a password-reset token for a given user and link.
- **`src/modules/users/tests/factories.ts`** — Provides `createUser`, `REPLACEMENT_PASSWORD`, and `userRepository` (used to assert stored `termsAcceptedAt`/`termsVersion`).
- **`src/modules/users/repository.ts`** — Transitive dependency via `userRepository` from the users factories; queried directly in assertions.
- **`tests/support/http.ts`** — `api()` gives a Supertest-style client for the two route-level tests.
- **`tests/support/response.ts`** — `asReject` / `asSuccess` unwrap the service result into typed success or error shapes.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity required by the service call.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` temporarily sets `NODE_TERMS_VERSION` so the stamped version is deterministic.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory test database before any suite runs.

## Notes

- The service-level `confirm` helper expects a **200** status on success, while the route-level test expects **204** — the two layers return different status codes for the same logical success.
- `termsAccepted` must be the boolean literal `true`; passing `false` (or omitting it) yields a 422. The test explicitly asserts this to lock down the "literally true" contract.
- Token validation is checked before terms validation: an invalid/expired link produces the standard dead-link error and never leaks the `termsAccepted` field name.
- The version stamped is whatever `NODE_TERMS_VERSION` is set to at call time; the test uses `withEnvironmentOverrides` to pin it to `'2026-11'` for a deterministic assertion.
