---
source: src/modules/notifications/tests/unit/get-notifications-stream.test.ts
sha256: e09df1e76a9fb71ac2297d2a541105794069751299c91c49f4300a587cd4b3e4
generated_at: 2026-10-29T04:33:59.447122+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/unit/get-notifications-stream.test.ts

## Purpose

Unit tests for the `GET /notifications/stream` controller. Verifies that the handler delegates the live response, the authenticated caller's ID, and a permission-recheck closure to `notificationsService.stream`, and that it fails closed (401) when the request is missing the context the authorization middleware is expected to have set.

## Key elements

- **`admittedRequest()`** — builds a stub `Request` carrying `sessionRecheck` (a jest.fn) and `authContext: { id: 'user-1' }`, simulating what `requirePermissionViaCookie` leaves behind.
- **`makeResponse()`** — builds a stub `Response` with `status`, `json`, and the four `*Header` methods the 401 branch touches; returns `{ response, status, json }` so tests can assert independently.
- **Test: "hands the response, the caller and a recheck to the streamer"** — asserts `notificationsService.stream` receives `(response, 'user-1', fn)` and that the handler itself calls `status` zero times (the stream owns the socket).
- **Test: "wires the recheck to the rule and the request"** — invokes the third argument of the `stream` call and asserts it resolves through `stillHoldsRuleViaCookie(request, 'read', 'Notification')`.
- **Test: "fails closed with 401" (`.each`, 2 cases)** — one request missing `sessionRecheck`, one missing `authContext`; both must produce `status(401)` + a JSON body with `code: 'UNAUTHORIZED'` and must **not** call `notificationsService.stream`.

## Relationships

- **`controllers/get-notifications-stream.ts`** — the unit under test; the file imports and calls `getNotificationsStream`.
- **`services/index.ts`** — `notificationsService` is jest-mocked; tests assert the shape and arguments of the `stream` call.
- **`kernel/middlewares/authorizations.ts`** — `stillHoldsRuleViaCookie` is selectively mocked (spread + `requireActual`) so only that one function is replaced while the rest of the module stays real.
- **`tests/support/stub.ts`** — provides `asStub<T>()` used to create the typed `Request` and `Response` stubs.

## Notes

- The authorization mock intentionally spreads `jest.requireActual` first so sibling guards (e.g., the cookie-reading helpers) remain functional; only `stillHoldsRuleViaCookie` is a jest.fn.
- The recheck closure is the sole mechanism that can revoke a caller mid-stream. The test exercises it by calling the captured third argument and asserting the rule/rule-name arguments, not by observing the stream's lifetime.
- The 401 branch is a belt-and-suspenders guard: in production the middleware should have already rejected such requests, so this path is defensive.
