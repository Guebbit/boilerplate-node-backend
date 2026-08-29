# src/modules/account/tests/unit/delete-account.test.ts

## Purpose

Unit tests for the two account-deletion controllers (`deleteAccountRequest` and `deleteAccountConfirm`). Verifies that each controller calls the correct service wrapper with the expected arguments, emits the right metric, and returns the appropriate HTTP response for success, "not found / not live," and service-error paths.

## Key elements

- **`describe('DELETE /account — deleteAccountRequest')`** — Three cases: user found → calls `requestAccountDeletion` + `inc({status:'success'})` + `successResponse`; user not found → skips deletion, `inc({status:'failure'})`, still returns 200 (enumeration prevention); service throws → `rejectResponse(res, 500, [])`.
- **`describe('DELETE /account/delete-confirm — deleteAccountConfirm')`** — Three cases: live token → calls `findLiveToken('delete', token)` then `removeOwnAccount` + `successResponse`; token not live (undefined) → skips removal, `rejectResponse(res, 422, …)`; service throws → `rejectResponse(res, 500, [])`.
- **`makeResponse()`** — Minimal `res` stub (`{ locals: {} }`) satisfying the controller's second parameter type.
- **Mock setup (module-level `jest.mock` calls)** — Stubs for `@modules/users` (`findByEmail`), `@modules/account/services` (`findLiveToken`, `requestAccountDeletion`, `removeOwnAccount`), `@infrastructure/http/response` (`successResponse`, `rejectResponse`), `@modules/account/metrics` (`authAccountDeleteTotal.inc`), and `@modules/account/session/cookies` (`destroyRefreshCookie`, `destroyLoggedCookie`).

## Relationships

- **`@modules/account/controllers/delete-account-request`** — SUT for the first describe block; the test asserts its outbound calls and response.
- **`@modules/account/controllers/delete-account-confirm`** — SUT for the second describe block; same pattern.
- **`@modules/account/services/index`** (`accountService`) — All three service methods are mocked so the controller's orchestration logic is tested in isolation.
- **`@modules/users/index`** (`userService.findByEmail`) — Mocked; only the "user exists?" lookup the controller performs is under test.
- **`@infrastructure/http/response`** — `successResponse` / `rejectResponse` mocked to assert the exact status and payload the controller returns.
- **`@modules/account/metrics`** — `authAccountDeleteTotal.inc` mocked to verify the controller records success/failure.
- **`@modules/account/session/cookies`** (not in the graph-neighbor list but mocked in-file) — `destroyRefreshCookie` / `destroyLoggedCookie`; the inline comment points to `token-cleanup.test.ts` for the reasoning behind this indirect mock.

## Notes

- **Mail and token-minting are deliberately unasserted here.** `requestAccountDeletion` sends the link and `removeOwnAccount` sends the goodbye mail; those are the services' own unit tests (`self-service.test.ts`) to verify. This file only checks the controller reached the wrapper with the right args.
- **Token-expiry is not a distinct branch in this suite.** `findLiveToken` returns `undefined` for both expired and never-existed tokens, collapsing the controller to a single 422 path. "Live" semantics are asserted in `self-service.test.ts` against a real document.
- **The cookies mock is required** because the controllers import the cookie-destroy helpers directly (bypassing a service boundary). See the parallel note in `token-cleanup.test.ts` for context.
- **`beforeEach(jest.clearAllMocks)`** is scoped inside each `describe`, not at the top level, so the two suites are fully independent.
