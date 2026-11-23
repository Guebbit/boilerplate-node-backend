---
source: src/modules/notifications/tests/unit/get-notifications-stream.test.ts
source_sha256: 96697ce931877bcdddd9951c9804063900de73d6c5b2b6088fbe66b01e2f49c7
context_sha256: 1cac5ba1420133ff40ddf24eabc22cc1c3789262aa548b28c3c14d79aa9d1430
generated_at: 2026-11-22T05:59:00.134326+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/tests/unit/get-notifications-stream.test.ts

## Purpose
Unit tests for the `GET /notifications/stream` controller (`getNotificationsStream`). They verify that the handler passes the raw response, the caller's id and a permission-recheck callback to the notifications streamer without writing to the response itself. They also verify that it fails closed with a 401 when the request lacks what `requireSessionViaCookie` normally sets.

## Key elements
- **Module mocks**
  - `notificationsService` is replaced with `{ stream: jest.fn() }`.
  - `@kernel/middlewares/authorizations` is spread from `jest.requireActual`, with only `stillSignedInViaCookie` replaced by a `jest.fn()`.
- **`admittedRequest()`** — builds a stub `Request` with `sessionRecheck` and `authContext: { id: 'user-1' }`, which is what an admitted request looks like.
- **`makeResponse()`** — builds a stub `Response` and returns `{ response, status, json }`. The stub includes `hasHeader`, `setHeader`, `getHeader` and `removeHeader`, because a 401 reads and sets its `WWW-Authenticate` challenge before answering.
- **Tests**
  1. **Happy path.** `status` is never called. `notificationsService.stream` is called with `(response, 'user-1', expect.any(Function))`.
  2. **Recheck wiring.** `stillSignedInViaCookie` is mocked to resolve `true`. The test grabs the third argument passed to `stream`, awaits it, and asserts `stillSignedInViaCookie` was called with the original request.
  3. **Fail-closed (`it.each`).** Covers a request with no `sessionRecheck` and a request with no `authContext`. Each must produce `status(401)` and a JSON body with a single `UNAUTHORIZED` error carrying a non-empty message. `stream` must not be called.
- `beforeEach` runs `jest.clearAllMocks()`.

## Relationships
- Tests `getNotificationsStream` from `src/modules/notifications/controllers/get-notifications-stream.ts`.
- Mocks `notificationsService` from `src/modules/notifications/services/index.ts` and asserts on its `stream` call.
- Mocks `stillSignedInViaCookie` from `src/kernel/middlewares/authorizations.ts` and asserts the controller's recheck delegates to it. The module's other exports stay real.
- Uses `asStub` from `tests/support/stub.ts` (imported as `@tests/stub`) to build partial `Request` and `Response` objects.

## Notes
- The recheck is the one place a revoked caller loses access mid-stream. There is no next request until the stream ends, so the streamer must be able to re-validate on its own.
- Test 1 notes that the stream owns the response for its lifetime, so the handler must not send anything first.
- The recheck's return value is not asserted. The test only checks that it is called with the original request.
