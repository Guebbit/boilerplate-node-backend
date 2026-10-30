---
source: src/modules/account/tests/integration/service-flows.test.ts
sha256: e4839deb997e6fc9379d093f3ceecf78d9adf84ad8cc5dffc7ef57ebbed1aff7
generated_at: 2026-10-29T03:00:23.149891+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/service-flows.test.ts

## Purpose

Integration tests for the account service's happy-path and argument-validation flows: signup, login, one-time token issuance, password change, and refresh-token exchange. Uses a real database (`setupTestDb`) to exercise the full service layer end-to-end. The sibling `service.test.ts` in the same directory covers security invariants; this file covers the ordinary paths they sit on.

## Key elements

- **`accountService.signup` suite** — verifies successful creation, password mismatch, duplicate-email (409), invalid email format (422), short password (422), and breached-password rejection (422).
- **`accountService.login` suite** — verifies successful auth, wrong password (401), unknown email (401), and soft-deleted-user rejection (401).
- **`issueToken` suite** — verifies plaintext return, that only a `hashToken` digest is persisted, expiry calculation, and the one-live-link (password) vs. many-live (mfa-challenge) replacement semantics.
- **`passwordChange` suite** — verifies success, mismatch (422), too-short (422), and that a new password actually unlocks login.
- **`accountService.refreshAccessToken` suite** — exchanges a real signed refresh token; checks success, reuse, and invalid-token outcomes (truncated in source).
- **`issueRefreshToken`** — local helper that creates a user and returns a real `startSession` result (the plaintext JWT, not a re-read from storage).
- **`jest.mock` of `@infrastructure/observability/audit`** — replaces the module with `auditPortMock()` from `tests/support/ports.ts`.

## Relationships

- **`src/modules/account/services/index.ts`** — primary SUT; `accountService.signup`, `.login`, `.refreshAccessToken` are called directly.
- **`src/modules/account/services/tokens.ts`** — `issueToken` is called and its DB effects asserted.
- **`src/modules/account/services/password.ts`** — `passwordChange` is called and its effects asserted.
- **`src/modules/account/session/jwt.ts`** — `startSession` mints real refresh tokens; `verifyAccessToken` is exercised indirectly via `refreshAccessToken`.
- **`src/modules/users/tests/factories.ts`** — provides `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, and `userRepository` (used to confirm persisted password changes).
- **`src/modules/account/tests/factories.ts`** — provides `tokenRowsOf` (reads token rows for assertions) and `dropSessionOf`.
- **`src/infrastructure/security/hash-token.ts`** — `hashToken` is called to compute the expected digest for token-persistence assertions.
- **`src/infrastructure/http/response.ts`** — `ResponseSuccess` / `ResponseReject` types shape every assertion.
- **`src/infrastructure/observability/audit.ts`** — fully replaced (not spied) with a mock port.
- **`src/modules/account/metrics.ts`** — `authRefreshReuseTotal` imported for refresh-flow assertions.
- **`src/modules/account/audit.ts`** — `accountAuditActions` imported (referenced in the full file).
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity for `signup`.
- **`src/modules/users/index.ts`** — `UserDocument` type used in success-response assertions.

## Notes

- **Audit is replaced, not spied.** `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes; it breaks under the SWC transform in `jest.config.mutation.js` and inside Stryker's sandbox. The full rationale lives in `tests/support/ports.ts`.
- **422, never 400.** All validation failures (bad email, short password, breached password, mismatch) assert `status === 422` because that is what `openapi.yaml` declares for the account endpoints.
- **`PLAIN_PASSWORD` is intentionally a breached password** (listed in `shared/rules/breached-passwords.txt`) so it can serve both as a valid test credential *and* as the sole integration proof that `accountService.signup` actually calls `assertPasswordNotBreached`.
- **JWT secrets are set via `setEnvironment`** in the `refreshAccessToken` suite's `beforeEach` because integration tests do not load `.env`; the same pattern is used in `jwt.test.ts`.
- **File location rationale:** lives under `account/tests/` (not `users/tests/`) because the code under test belongs to the account module, even though it exercises user documents.
