---
source: src/modules/notifications/tests/unit/get-notifications-stream.test.ts
sha256: 96697ce931877bcdddd9951c9804063900de73d6c5b2b6088fbe66b01e2f49c7
generated_at: 2026-11-08T06:36:37.596972+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/unit/get-notifications-stream.test.ts

## Purpose

Unit tests for the `GET /notifications/stream` controller. They verify three contract points: the handler delegates the raw response, caller id, and a permission-recheck callback to the notification streamer; the recheck callback is wired to `stillSignedInViaCookie` and the original request; and a request missing either `sessionRecheck` or `authContext.id` is refused with a 401 and no stream is opened.

## Key elements

- **`admittedRequest()`** — factory returning a typed `Request` stub carrying `sessionRecheck: jest.fn()` and `authContext: { id: 'user-1' }`, i.e. the shape `requireSessionViaCookie` would leave behind.
- **`makeResponse()`** — factory returning a typed `Response` stub (with `status`, `json`, and the header-reading methods a 401 path exercises) plus handles to the `status` and `json` spies for assertions.
- **`describe('GET /notifications/stream')`** — the test suite containing three cases:
  - *Delegation* — asserts `notificationsService.stream` receives `(response, 'user-1', <fn>)` and that the controller writes nothing to the response itself.
  - *Recheck wiring* — invokes the third argument (the recheck function) and asserts it called `stillSignedInViaCookie` with the exact request object that opened the stream.
  - *Fail-closed 401* (`.it.each`) — two parameterized cases (`no recheck`, `no resolved caller`) asserting `status(401)` + a `UNAUTHORIZED` error body, and that `notificationsService.stream` is never called.

## Relationships

- **`src/modules/notifications/controllers/get-notifications-stream.ts`** — the module under test; `getNotificationsStream` is the sole entry point exercised.
- **`src/modules/notifications/services/index.ts`** — fully mocked; `notificationsService.stream` is the collaborator the controller delegates to.
- **`src/kernel/middlewares/authorizations.ts`** — selectively mocked: only `stillSignedInViaCookie` is replaced (via `...jest.requireActual`), keeping the module's other guards intact. The recheck test asserts this function is called with the original request.
- **`tests/support/stub.ts`** — provides `asStub<T>` to create structurally-typed stubs for `Request` and `Response` without pulling in a real Express instance.

## Notes

- The selective mock of `@kernel/middlewares/authorizations` (spread + `requireActual`) is deliberate: the module exports other guard functions, and replacing the whole module would break them.
- `makeResponse` stubs the full header API (`hasHeader`, `setHeader`, `getHeader`, `removeHeader`) because the 401 path reads and sets a `WWW-Authenticate` challenge before responding; omitting them would throw at runtime.
- The recheck is the only enforcement point for a revoked caller on a live SSE stream (there is no subsequent request until the stream ends), which is why the tests pin both *that* it is called and *with which* request object.
