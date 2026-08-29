# src/modules/account/tests/unit/token-cleanup.test.ts

## Purpose

Unit test suite that verifies `runTokenCleanup` is invoked **before** the authentication step in both the login and refresh-token controllers. It does not test the cleanup logic itself or the authentication outcome — only the ordering guarantee and one early-exit case.

## Key elements

- **Single `jest.mock` for `@modules/account/services`** — provides `runTokenCleanup`, `accountService.login`, and `accountService.refreshAccessToken` as `jest.fn()`s. One factory covers all three because they now share a barrel export.
- **`jest.mock` for `@modules/account/session/cookies`** — stubs `createRefreshCookie` and `createLoggedCookie` so controller code paths don't touch real cookie logic.
- **`jest.mock` for `@infrastructure/http/response`** — stubs `successResponse` / `rejectResponse`.
- **`mockRunTokenCleanup` / `mockLogin` / `mockRefreshAccessToken`** — typed `jest.MockedFunction` handles extracted from the mocked barrel, used in assertions.
- **`describe('Auth controllers token cleanup trigger')`** — three tests:
  - *runs cleanup before login authentication* — calls `postLogin` with a failing login; asserts `invocationCallOrder[0]` of cleanup < login.
  - *runs cleanup before refresh-token access token creation* — calls `getRefreshToken` with a valid cookie; asserts cleanup precedes `refreshAccessToken`.
  - *does not run cleanup in refresh flow when refresh token is missing* — calls `getRefreshToken` with no cookie; asserts cleanup was **not** called while `refreshAccessToken` was still invoked with `undefined`.

## Relationships

- **`controllers/post-login.ts`** and **`controllers/get-refresh-token.ts`** — the two controller functions under test; each is called with a stubbed Express request/response pair to trigger the cleanup-then-auth sequence.
- **`services/index.ts`** (barrel) — the module path mocked in bulk; provides `accountService` and `runTokenCleanup`.
- **`services/token-cleanup.ts`** — historical source of `runTokenCleanup`; now re-exported through the barrel, so the mock targets the barrel path rather than this file directly.
- **`tests/support/stub.ts`** — supplies `asStub<T>()` to build minimally-shaped Express request objects that satisfy the controller's type signatures without a full Express app.

## Notes

- The services barrel is mocked **once**. A second `jest.mock` on the same module path *replaces* the first factory rather than merging, which would leave earlier keys undefined at call time. This is documented inline and is the reason `refreshAccessToken` (added to the barrel recently) lives in the same mock object.
- `refreshAccessToken` is mocked rather than allowed to call through, keeping the suite scoped to ordering only — it does not exercise JWT creation or audit-record emission (see `authentication.ts`).
- In the missing-cookie test, `runTokenCleanup` is intentionally **not** called. The service still receives the call (with `undefined`) and reports the refusal; the controller does not pre-gate on cookie presence. This is a deliberate design decision captured by the assertion.
