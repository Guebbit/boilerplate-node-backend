# src/modules/account/tests/unit/token-cleanup.test.ts

## Purpose

Unit tests that verify the `runTokenCleanup` pre-flight sweep is invoked at the correct point in the `postLogin` and `getRefreshToken` controller flows: before credential checks, and **not** at all when a refresh request arrives with no cookie (since the request cannot succeed and a full-table sweep would be wasted).

## Key elements

- **`describe('Auth controllers token cleanup trigger')`** — the sole test suite; three cases, each calling a real controller with a stubbed request/response.
- **`runs cleanup before login authentication`** — asserts `runTokenCleanup` fires before `accountService.login` via `invocationCallOrder`, with login returning a 401 result.
- **`runs cleanup before refresh-token access token creation`** — asserts `runTokenCleanup` fires before `accountService.refreshAccessToken`, passing a cookie value `'refresh-token'`.
- **`does not run cleanup in refresh flow when refresh token is missing`** — asserts `runTokenCleanup` is **not** called while `refreshAccessToken` is still invoked with `undefined` (the service reports the refusal, not the controller).
- **`jest.mock('@modules/account/services', …)`** — single factory mock covering `runTokenCleanup`, `accountService.login`, and `accountService.refreshAccessToken` in one object.
- **`jest.mock('@modules/account/session/cookies')` / `jest.mock('@infrastructure/http/response')`** — stub out side-effect imports so controllers run without I/O.
- **Typed mock accessors** (`mockRunTokenCleanup`, `mockLogin`, `mockRefreshAccessToken`) — `jest.MockedFunction<typeof …>` casts for type-safe `mockResolvedValue` / `invocationCallOrder` usage.

## Relationships

- **`src/modules/account/controllers/post-login.ts`** — imported and invoked directly; the test drives `postLogin` to observe cleanup ordering.
- **`src/modules/account/controllers/get-refresh-token.ts`** — imported and invoked directly; the test drives `getRefreshToken` with and without a `jwt` cookie.
- **`src/modules/account/services/index.ts`** — the module path that is `jest.mock`-ed; provides both `runTokenCleanup` and `accountService` that the tests assert against.
- **`src/modules/account/services/token-cleanup.ts`** — the implementation of `runTokenCleanup`; this test validates *when* it is called, not *how* it works.
- **`tests/support/stub.ts`** — provides `asStub`, used to cast plain request objects to the controller's expected parameter type without constructing a full Express `Request`.

## Notes

- **One `jest.mock` per module path.** A second `jest.mock('@modules/account/services', …)` would *replace* the first factory entirely (Jest does not merge), leaving earlier keys `undefined` at call time. All service members must live in a single factory object.
- **Ordering via `invocationCallOrder`, not call counts.** The test explicitly asserts `invocationCallOrder[0] < invocationCallOrder[0]` between the two mocks. Plain `toHaveBeenCalledTimes(1)` cannot distinguish "ran first" from "ran after."
- **`refreshAccessToken` is mocked on `accountService`, not on `../session/jwt`.** `getRefreshToken` now delegates through the service layer, so the old direct-JWT mock would not be hit.
- **Missing-cookie case is a service concern.** The controller still calls `refreshAccessToken(undefined, …)`; the 401-equivalent comes back from the service. The test encodes that the *controller* skips cleanup, not that it short-circuits the call.
