---
source: src/modules/account/tests/integration/service-flows.test.ts
sha256: e03fb7ec0eabb47f7c783ce901a54e3e190cab782817d0b7d86552d8f03b5f6d
generated_at: 2026-09-23T18:14:29.960627+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/service-flows.test.ts

## Purpose

Integration tests for the four ordinary flows of `accountService` — signup, login, `tokenAdd`, and `passwordChange` — exercising both the success paths and the argument-level rejections in front of them. Drives a **real database** via `setupTestDb`. Lives here (not under `users`) because the code under test is `account`'s service. A sibling `service.test.ts` covers the security invariants; this file covers the paths those invariants sit on.

## Key elements

- **`accountService.signup` tests** — success; password-mismatch rejection; 409 on duplicate email; 422 on invalid email format; 422 on short password; 422 on a breached-but-composition-valid password (`Password1!`).
- **`accountService.login` tests** — success with correct credentials; 401 for wrong password; 401 for non-existent email; 401 for a soft-deleted user (`deletedAt` set).
- **`accountService.tokenAdd` tests** — returns a 32-character string; persists the token into the user document; sets an `expiration` timestamp when `expirationTime` is supplied.
- **`accountService.passwordChange` tests** — success; 422 on mismatch; 422 on too-short new password; end-to-end proof that the new password actually works for a subsequent `login`.
- **`issueRefreshToken` helper** — creates a user and calls `createRefreshToken(user.id)`, returning the real signed refresh token (not the stored hash).
- **Audit port mock** (`jest.mock('@infrastructure/observability/audit', …)`) — replaces the entire module rather than spying on it (see Notes).
- **`setupTestDb()`** — called once at module scope; all tests share the real DB lifecycle.

## Relationships

| Neighbor                                    | Interaction                                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/account/services/index.ts`     | Imports `accountService` — the code under test.                                                                                        |
| `src/modules/users/tests/factories.ts`      | Imports `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, and `userRepository` for test data setup and DB assertions.            |
| `src/modules/users/index.ts`                | Imports the `UserDocument` type for result casting.                                                                                    |
| `src/modules/account/session/jwt.ts`        | Imports `createRefreshToken` and `verifyAccessToken` for refresh-token flow tests.                                                     |
| `src/infrastructure/http/response.ts`       | Imports `ResponseSuccess` / `ResponseReject` types for narrowing service results.                                                      |
| `src/infrastructure/observability/audit.ts` | **Mocked** (module-level `jest.mock`); the replacement re-routes `recordAudit` through the fake `emitAuditEvent`.                      |
| `src/modules/account/audit.ts`              | Imports `accountAuditActions` (used in the refresh-token section).                                                                     |
| `tests/support/setup-test-db.ts`            | Provides `setupTestDb`, the real-DB bootstrap.                                                                                         |
| `tests/support/callers.ts`                  | Provides `testCallerContext` for the `signup` call.                                                                                    |
| `tests/support/ports.ts`                    | Referenced in the mock comment for the full reasoning behind the replacement strategy; `observePort` is imported for audit assertions. |

## Notes

- **Audit port is replaced, not spied on.** `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes; this fails under the SWC transform used by `jest.config.mutation.js` and inside Stryker's sandbox. The mock also re-routes `recordAudit` (which closes over its own module's real `emitAuditEvent`) so a spy on `emitAuditEvent` still sees every `recordAudit` call.
- **422 for all validation rejections, including auth.** This matches `openapi.yaml`, which declares 422 and never declares 400.
- **`PLAIN_PASSWORD` is deliberately a breached password** (`Password1!`, listed in `breached-passwords/list.txt`) so the same constant can serve both the normal-path tests and the breach-check rejection test.
- **`tokens[].token` at rest is a `hashToken` digest**, never the plaintext JWT. The refresh-token tests therefore assert against `createRefreshToken`'s return value, not a re-read from storage.
- **File placement is intentional.** The tests sit under `account/tests/integration/` because the service under test belongs to the `account` module, even though they touch `users` data.
