---
source: src/modules/account/tests/integration/service-flows.test.ts
sha256: ae1dfda15b472c5ebec730b572cd33da0359566f8b53f988fdbf96c9531e662d
generated_at: 2026-11-14T19:10:04.050369+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/service-flows.test.ts

## Purpose

Integration tests for the account service's ordinary (happy-path and argument-rejection) flows: signup, login, one-time token issuance, password change, and refresh-token exchange. Drives a real database via `setupTestDb` and complements the sibling `service.test.ts`, which covers security invariants. Lives under `account/tests/` (not `users/tests/`) because the code under test is `account`'s.

## Key elements

- **`describe('accountService.signup')`** — success path, password mismatch (422), duplicate email (409 / `EMAIL_ALREADY_USED`), invalid email format (422), short password (422), and a breached-but-composition-valid password (`Password1!`).
- **`describe('accountService.login')`** — success with correct credentials, wrong password (401), non-existent email (401), and soft-deleted user (401).
- **`describe('issueToken')`** — plaintext returned to caller, only `hashToken` digest persisted, expiry set to `now + lifetime`, and the one-live-link (`password`) vs. many-live-link (`mfa-challenge`) replacement semantics.
- **`describe('passwordChange')`** — success, mismatch (422), too-short (422), and a round-trip proving the new password actually authenticates on subsequent login.
- **`describe('accountService.refreshAccessToken')`** — three outcomes of exchanging a refresh cookie, verified against a real signed token (not a stub). Sets `NODE_TOKEN_ACCESS` / `NODE_TOKEN_REFRESH` in `beforeEach` because unit tests don't load dotenv.
- **`issueRefreshToken`** (local helper) — creates a user and calls `startSession` to produce a real stored refresh token for the refresh tests.
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces the audit port with `auditPortMock()` from `@tests/ports`.

## Relationships

- **`src/modules/account/services/index.ts`** — exports the `accountService` object whose `signup`, `login`, and `refreshAccessToken` methods are the primary SUT for most blocks.
- **`src/modules/account/services/tokens.ts`** — exports `issueToken`; the test asserts its DB side-effects (hash storage, expiry, kind-replacement).
- **`src/modules/account/services/password.ts`** — exports `passwordChange`; the test verifies the changed credential via a subsequent `login` call.
- **`src/modules/account/session/jwt.ts`** — `startSession` creates the real refresh token; `verifyAccessToken` is used in the refresh block.
- **`src/infrastructure/security/hash-token.ts`** — `hashToken` is called to build the expected digest and assert the stored row holds only the hash.
- **`src/infrastructure/observability/audit.ts`** — mocked at module level (not spied) via `auditPortMock()`.
- **`src/modules/account/audit.ts`** — `accountAuditActions` is imported for audit-assertion matching.
- **`src/modules/account/metrics.ts`** — `authRefreshReuseTotal` is imported and asserted in the refresh block.
- **`src/infrastructure/http/response.ts`** — `ResponseSuccess` / `ResponseReject` types used for discriminated-union narrowing in assertions.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, and `userRepository` provide shared user fixtures and post-change lookups.
- **`src/modules/account/tests/factories.ts`** — `tokenRowsOf` and `dropSessionOf` read/delete token and session rows for assertions.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity passed to service methods.
- **`src/modules/users/index.ts`** — source of the `UserDocument` type used in result casts.

## Notes

- **Audit port is replaced, not spied.** `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes; this fails under Stryker's sandbox and the SWC transform. The `jest.mock` call delegates to `auditPortMock()` in `tests/support/ports.ts`.
- **422 for all validation failures.** The file deliberately asserts 422 (not 400) for invalid email, short password, and mismatched passwords, matching `openapi.yaml`, which declares 422 and never declares 400.
- **`PLAIN_PASSWORD` is a breached password.** It is `Password1!`, a listed entry in `shared/rules/breached-passwords.txt`, chosen so the "breached but composition-valid" test case works against `accountService.signup`.
- **`setupTestDb()` runs at module scope** (not per-test), giving every `describe` block the same real database connection.
- **Refresh tests set JWT secrets manually** via `setEnvironment` because the unit-test environment does not load `.env`; this mirrors the convention in `jwt.test.ts`.
