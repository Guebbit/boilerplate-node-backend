# src/modules/account/tests/unit/token-cleanup.test.ts

## Purpose

Unit tests that verify the `runTokenCleanup` pre-flight sweep is invoked before credential validation in both `postLogin` and `getRefreshToken`, and is **skipped** when a refresh request carries no token (an anonymous hit that cannot succeed). The ordering assertions are the core contract: cleanup must precede the auth check, not merely co-occur with it.

## Key elements

- **`describe('Auth controllers token cleanup trigger')`** — the single test group; all three specs live here.
- **`runs cleanup before login authentication`** — asserts `runTokenCleanup` fires once and its `invocationCallOrder` index is less than `accountService.login`'s.
- **`runs cleanup before refresh-token access token creation`** — same ordering check against `accountService.refreshAccessToken`.
- **`does not run cleanup in refresh flow when refresh token is missing`** — asserts `runTokenCleanup` is *not* called when `cookies` is empty; `refreshAccessToken` is still called (with `undefined`) so the refusal is reported by the service.
- **Single `jest.mock('@modules/account/services', …)`** — provides both `runTokenCleanup` and `accountService` (with `login` and `refreshAccessToken`) in one factory to avoid the "second mock replaces first" pitfall.
- **`asStub<…>`** (from `tests/support/stub.ts`) — wraps minimal request objects into the Express `Request` shape the controllers expect.

## Relationships

- **`src/modules/account/controllers/post-login.ts`** — imported and called directly; the test drives `postLogin` with a stubbed request to trigger the cleanup-before-login path.
- **`src/modules/account/controllers/get-refresh-token.ts`** — imported and called directly; drives both the "cleanup before refresh" and "skip cleanup when no cookie" paths.
- **`src/modules/account/services/index.ts`** — the module-level `jest.mock` target; provides `runTokenCleanup` and `accountService`.
- **`src/modules/account/services/token-cleanup.ts`** — the implementation under test (exercised indirectly via the mocked `runTokenCleanup` export from the services barrel).
- **`tests/support/stub.ts`** — supplies `asStub` to cast plain objects to Express request types without a real HTTP server.

## Notes

- Ordering is asserted via `mock.invocationCallOrder[i]` comparison, **not** call counts. Call counts cannot distinguish "ran first" from "ran after"; the comment in the file calls this out explicitly.
- The mock for `@modules/account/services` must be a single `jest.mock` call. A second call to the same path *replaces* the first rather than merging, which would leave half the exports `undefined` at call time.
- `refreshAccessToken` is mocked on `accountService` (not on `@modules/account/session/jwt`) because `getRefreshToken` now delegates through the service layer.
- The "missing token" test expects `refreshAccessToken` to be called with `undefined` as its first argument — the controller passes through whatever the cookie is (even `undefined`) and lets the service produce the error response.
