---
source: src/modules/account/tests/integration/service-flows.test.ts
sha256: e4839deb997e6fc9379d093f3ceecf78d9adf84ad8cc5dffc7ef57ebbed1aff7
generated_at: 2026-11-08T04:41:58.003700+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/service-flows.test.ts

## Purpose

Integration tests for the account service's happy paths and argument-level rejections: signup, login, one-time token issuance, password change, and refresh-token exchange. Driven against a real database via `setupTestDb`. Complements the sibling `service.test.ts`, which covers security invariants; this file covers the functional flows those invariants guard.

## Key elements

- **`accountService.signup`** (describe block) — Asserts success, password-mismatch rejection, 409 on duplicate email, 422 on invalid email / short password / breached password (`'Password1!'` from the breached list).
- **`accountService.login`** (describe block) — Asserts success, 401 for wrong password, unknown email, and soft-deleted (`deletedAt`) users.
- **`issueToken`** (describe block) — Verifies token is returned in plaintext, only the `hashToken` digest is persisted, expiry is set to ~`lifetime`, and "one-live-link" kinds replace their previous row while "many-live" kinds accumulate.
- **`passwordChange`** (describe block) — Verifies success, 422 on mismatch / too-short, and that the new password actually works for subsequent login.
- **`issueRefreshToken`** (local helper) — Creates a user and calls `startSession`; returns the access/refresh pair (the plaintext JWT, not the stored hash).
- **`accountService.refreshAccessToken`** (describe block) — Exercises the three refresh outcomes using a real signed token; sets JWT environment variables in `beforeEach` because unit-test contexts don't load dotenv.
- **`jest.mock('@infrastructure/observability/audit')`** — Replaces the audit port with `auditPortMock()` from `@tests/ports`.

## Relationships

- **SUT**: `src/modules/account/services/index.ts` (`accountService`), `src/modules/account/services/password.ts` (`passwordChange`), `src/modules/account/services/tokens.ts` (`issueToken`).
- **JWT / session**: `src/modules/account/session/jwt.ts` — `startSession` is used to mint a real refresh token; `verifyAccessToken` is exercised indirectly via `refreshAccessToken`.
- **Audit**: `src/modules/account/audit.ts` provides `accountAuditActions` (asserted on via the port mock); `src/infrastructure/observability/audit.ts` is the port being replaced.
- **Assertions on persisted state**: `src/infrastructure/security/hash-token.ts` (`hashToken`) is used to verify the stored token digest; `src/modules/account/tests/factories.ts` provides `tokenRowsOf` and `dropSessionOf` for DB reads/cleanup.
- **User fixtures**: `src/modules/users/tests/factories.ts` supplies `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, and `userRepository`; `src/modules/users/index.ts` / `model.ts` provide the `UserDocument` type.
- **Caller context**: `tests/support/callers.ts` (`testCallerContext`) is passed as the second argument to `signup`.
- **Metrics**: `src/modules/account/metrics.ts` (`authRefreshReuseTotal`) is observed in the refresh tests.
- **Response types**: `src/infrastructure/http/response.ts` — `ResponseSuccess` / `ResponseReject` used in type assertions.
- **Port observation**: `tests/support/ports.ts` (`observePort`, `auditPortMock`).

## Notes

- **Audit port is replaced, not spied.** `jest.spyOn` cannot redefine the non-configurable getter exposed by a CommonJS namespace import under the swc transform used by Stryker. The `jest.mock` + `auditPortMock()` pattern is the workaround; see `tests/support/ports.ts` for full reasoning.
- **422, not 400, for all validation failures.** The OpenAPI spec declares only 422 for validation errors (including auth-related ones); no 400 is ever expected.
- **Breached-password case is the sole end-to-end proof** that `accountService.signup` calls `assertPasswordNotBreached`; the unit test for that helper lives elsewhere.
- **`issueRefreshToken` returns `startSession`'s own output**, not a re-read from the DB — the stored row contains only a `hashToken` digest, never the plaintext JWT.
- **Environment variables** (`NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, etc.) are set per-block because the integration runner does not load `.env`; the same convention applies in `jwt.test.ts`.
