---
source: src/modules/account/tests/integration/service-flows.test.ts
sha256: f767eb511fce5b9ab1b60d6a4ac89cba5a44ac438917fd650c6e27bbeeabac2b
generated_at: 2026-09-27T14:35:35.595358+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/service-flows.test.ts

## Purpose

Integration tests that exercise the "ordinary" (happy-path and argument-rejection) flows of `accountService` — signup, login, tokenAdd, passwordChange, and refresh-token exchange — against a real database. The sibling `service.test.ts` owns the security invariants; this file exists so the normal request/response contract is verified end-to-end without mocking the data layer.

## Key elements

- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces (not spies on) the audit module so that `emitAuditEvent` is a `jest.fn()` and `recordAudit` is rewired to call that replacement. Avoids the non-configurable-getter problem under SWC/Stryker.
- **`setupTestDb()`** — Provisions and tears down a real database for the suite.
- **`describe('accountService.signup')`** — Verifies success, password-mismatch rejection, 409 duplicate email, 422 invalid email, 422 short password, and 422 breached-password rejection.
- **`describe('accountService.login')`** — Verifies success, 401 wrong password, 401 unknown email, and 401 for soft-deleted users.
- **`describe('accountService.tokenAdd')`** — Verifies token creation (32-char string), DB persistence, and expiration-date setting.
- **`describe('accountService.passwordChange')`** — Verifies success, 422 mismatch, 422 too-short, and that the new password actually unlocks login.
- **`issueRefreshToken()` / refresh-access-token block** — Drives `createRefreshToken` + `verifyAccessToken` against a real signed JWT to test the three refresh-cookie outcomes (file is truncated here).

## Relationships

- **`@modules/account/services` (index.ts)** — The code under test; every `describe` block calls a method on `accountService`.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb` so all assertions hit a real database rather than mocks.
- **`@modules/users/tests/factories.ts`** — Supplies `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, and `userRepository` for seeding and post-condition checks.
- **`@modules/account/session/jwt.ts`** — `createRefreshToken` and `verifyAccessToken` are used in the refresh-token flow to produce and verify real signed JWTs.
- **`@infrastructure/observability/audit.ts`** — Fully replaced via `jest.mock`; the test asserts audit events are emitted without exercising the real transport.
- **`src/modules/account/audit.ts`** — `accountAuditActions` is imported (likely used in the truncated refresh section).
- **`@infrastructure/http/response.ts`** — `ResponseSuccess` / `ResponseReject` types shape every assertion on the service return value.
- **`tests/support/callers.ts`** — Provides `testCallerContext` for service calls that require a caller identity.
- **`tests/support/ports.ts`** — Referenced in the mock-strategy comment; the file documents *why* replacement is used instead of `jest.spyOn`.
- **`@modules/users` (index / model / repository)** — `UserDocument` type and `userRepository` for persistence assertions.

## Notes

- Validation failures (bad email, short password, breached password) all return **422**, not 400 — this matches `openapi.yaml`, which never declares a 400.
- `PLAIN_PASSWORD` is intentionally a breached-list entry (`Password1!`) so the "breached password" test case has a composition-valid fixture.
- The audit mock is a **module replacement**, not a spy. `jest.spyOn` cannot override the non-configurable getter produced by a CommonJS namespace import under the SWC transform or Stryker's sandbox. See `tests/support/ports.ts` for the full rationale.
- The file lives under `account/tests` (not `users/tests`) because the code under test belongs to the `account` module, even though user records are created via the `users` factory.
