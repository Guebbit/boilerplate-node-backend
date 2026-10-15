---
source: src/modules/notifications/tests/unit/get-notifications-stream.test.ts
sha256: 9f46cf989a8f06055a374a0f30cc26b60028f62ccf2a9eb0ebfc9def59b17a46
generated_at: 2026-10-15T10:53:15.469025+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/unit/get-notifications-stream.test.ts

## Purpose

Unit tests for the `getNotificationsStream` controller. Verifies three contracts: the controller delegates to the stream service without writing to the response itself, the permission recheck it passes is wired to the correct key and request, and the controller fails closed (401) when the auth context or recheck is absent.

## Key elements

- **`admittedRequest()`** — returns a typed stub `Request` carrying `sessionRecheck: jest.fn()` and `authContext: { id: 'user-1' }`, simulating what `requirePermissionViaCookie` leaves on an admitted request.
- **`makeResponse()`** — returns a stub `Response` plus handles to the `status` and `json` mocks, so tests can assert on refusal payloads.
- **`describe('GET /notifications/stream')`** — three test cases:
  - *Delegation*: calls the controller, asserts `response.status` is never called and `streamNotifications` receives `(response, 'user-1', fn)`.
  - *Recheck wiring*: invokes the recheck function captured from the `streamNotifications` call and asserts it calls `stillHoldsKeyViaCookie(request, NOTIFICATIONS_READ_KEY)`.
  - *Fail-closed (parameterized)*: for a request missing `sessionRecheck` or missing `authContext`, asserts a 401 with an `UNAUTHORIZED` error code and that no stream is opened.
- **Mock setup** — `streamNotifications` (from the services barrel) is fully mocked; `stillHoldsKeyViaCookie` is replaced via a partial `jest.mock` that spreads `jest.requireActual` so the rest of the authorizations module stays intact.

## Relationships

- **`src/modules/notifications/controllers/get-notifications-stream.ts`** — the unit under test. Imports `getNotificationsStream` and the `NOTIFICATIONS_READ_KEY` constant.
- **`src/modules/notifications/services/index.ts`** — mocked barrel; the test imports `streamNotifications` through it rather than reaching into `services/stream.ts` directly.
- **`src/kernel/middlewares/authorizations.ts`** — partially mocked. Only `stillHoldsKeyViaCookie` is a jest mock; all other exports in that module are loaded via `jest.requireActual`.
- **`tests/support/stub.ts`** — provides the `asStub` generic used to build type-safe fake `Request`/`Response` objects without pulling in real Express instances.

## Notes

- The recheck passed to `streamNotifications` is a live closure; test 2 calls it (`void call[2]()`) to trigger the assertion on `stillHoldsKeyViaCookie`. Forgetting to invoke it would let the test pass vacuously.
- The fail-closed tests use `it.each` with two shape-missing variants. The error body is asserted with `expect.objectContaining` / `stringMatching(/\S+/)` rather than an exact string, so the message wording can change without breaking the test.
- The module-level doc comment frames the security rationale: the recheck is the *only* mechanism that can revoke a caller mid-stream (there is no "next request" until the stream ends). The 401 branch is the fail-closed fallback for a request that somehow bypasses the middleware.
