---
source: src/modules/account/tests/unit/token-cleanup.test.ts
sha256: 7a51043e361985ae767f24c98c39098e17ab279c0405a89eb451782390b03e77
generated_at: 2026-09-23T18:17:27.273436+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/token-cleanup.test.ts

## Purpose

Unit test suite that verifies the `runTokenCleanup` pre-flight sweep is invoked at the correct point in the `postLogin` and `getRefreshToken` controller flows: it must run **before** credential/token validation, and it must be **skipped** in the refresh flow when no `jwt` cookie is present (since such a request cannot succeed, and a full-table user sweep would be wasted work).

## Key elements

- **`describe('Auth controllers token cleanup trigger')`** — the sole test block; three cases.
- **`'runs cleanup before login authentication'`** — calls `postLogin` with valid-shaped credentials, asserts `runTokenCleanup` is called and its `invocationCallOrder` is less than `accountService.login`'s.
- **`'runs cleanup before refresh-token access token creation'`** — calls `getRefreshToken` with a `jwt` cookie, asserts cleanup precedes `accountService.refreshAccessToken`.
- **`'does not run cleanup in refresh flow when refresh token is missing'`** — calls `getRefreshToken` with an empty `cookies` object; asserts cleanup is **not** called while the service **is** (with `undefined` token), confirming the controller short-circuits the sweep but still delegates the refusal to the service layer.
- **`jest.mock('@modules/account/services', …)`** — single mock of the entire service barrel; provides `runTokenCleanup`, `accountService.login`, `accountService.refreshAccessToken`, and `twoFactorService.buildLoginChallenge`.
- **`jest.mock('@modules/account/session/cookies', …)`** and **`jest.mock('@infrastructure/http/response', …)`** — stubs for side-effect helpers so no real cookie writes or HTTP responses occur.
- **`asStub` (from `@tests/stub`)** — casts a partial request object to the full controller-parameter type without needing a complete HTTP request.
- **`PLAIN_PASSWORD` (from `@modules/users/tests/factories`)** — constant used as the password in the login test body.

## Relationships

- **`src/modules/account/controllers/post-login.ts`** — calls `postLogin` directly; the system under test for the login ordering case.
- **`src/modules/account/controllers/get-refresh-token.ts`** — calls `getRefreshToken` directly; the system under test for both refresh-ordering and missing-cookie cases.
- **`src/modules/account/services/index.ts`** — mocked as a whole barrel; the test imports `runTokenCleanup` and `accountService` through this path.
- **`src/modules/account/services/token-cleanup.ts`** — the real implementation that `runTokenCleanup` re-exports; the function whose call-site ordering is the subject of this suite.
- **`src/modules/users/tests/factories.ts`** — supplies the `PLAIN_PASSWORD` constant.
- **`tests/support/stub.ts`** — supplies the `asStub` helper for building minimal request objects.

## Notes

- Ordering is asserted with `mock.invocationCallOrder` rather than call counts, because two calls at the same count cannot distinguish "ran first" from "ran after."
- There is deliberately **one** `jest.mock` for `@modules/account/services`. A second mock on the same path would *replace* the first rather than merge, leaving half the exports `undefined` at call time.
- `refreshAccessToken` is mocked here (instead of the lower-level `session/jwt` module) because this suite's scope is cleanup ordering, not token generation internals.
- In the missing-cookie case the controller still invokes the service (passing `undefined`); the 4xx/refusal is the service's responsibility, not the controller's. The test pins that contract.
