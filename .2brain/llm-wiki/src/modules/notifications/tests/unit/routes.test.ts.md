---
source: src/modules/notifications/tests/unit/routes.test.ts
sha256: ac9157ce98c7bf65a3d22501833948658b8f4c39fb1407e160b2cb72a9193b26
generated_at: 2026-10-29T04:34:17.863319+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/unit/routes.test.ts

## Purpose

Unit test for the notifications route table. Verifies that every route carries the correct authentication and authorization guards, and specifically that the SSE stream endpoint is gated by cookie-based permission rather than a bearer token — the one constraint an `EventSource` client cannot satisfy.

## Key elements

- **`it.each([...])` — "requires a bearer session and a key"** — Parameterized test asserting that `GET /`, `POST /read-all`, `DELETE /`, `GET /:id`, and `DELETE /:id` each include both `isAuth` and `requirePermissionGuard` in their guard chain.
- **`it('authenticates the stream by cookie, not by bearer token')`** — Asserts `GET /stream` includes `requirePermissionViaCookieGuard` and explicitly does **not** include `isAuth`.

## Relationships

- **`src/modules/notifications/routes.ts`** — Exports the `router` that is the system under test.
- **`tests/support/routes.ts`** — Exports the `guardsOn(router, signature)` helper used to extract and inspect the guard chain for a given route method+path.

## Notes

- The negative assertion on the stream route (`not.toContain('isAuth')`) is intentional and load-bearing: a bearer guard would break SSE because `EventSource` cannot set the `Authorization` header. If a future refactor adds `isAuth` to `/stream`, this test will fail and signal a real regression, not a test error.
- The module doc comment at the top restates the cookie-vs-bearer constraint; keep it in sync if the stream's auth strategy changes.
