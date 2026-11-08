---
source: src/modules/notifications/tests/unit/routes.test.ts
sha256: 1c71be02cdc667a0c169fe990c525f9a9ddfd32805d4ff94b9ca6d8cbb9e0462
generated_at: 2026-11-08T06:36:56.815863+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/unit/routes.test.ts

## Purpose

Verifies the authentication guard configuration on every route in the notifications router. It ensures standard CRUD routes require a bearer session with no permission rule, and that the SSE stream route authenticates via cookie (because `EventSource` cannot send a `Authorization` header).

## Key elements

- **`describe('notifications routes')`** – top-level suite; imports `router` from the notifications module and `guardsOn` from the test-support helper.
- **`it.each(['GET /', 'POST /read-all', 'DELETE /', 'GET /:id', 'DELETE /:id'])`** – parameterised check that each of the five standard routes carries the `isAuth` guard and does **not** carry `requirePermissionGuard`.
- **`it('authenticates the stream by cookie, not by bearer token')`** – asserts that `GET /stream` uses `requireSessionViaCookieGuard`, and explicitly *excludes* both `isAuth` and `requirePermissionViaCookieGuard`.

## Relationships

- **`src/modules/notifications/routes.ts`** — the subject under test; this file imports its exported `router` to inspect guard chains.
- **`tests/support/routes.ts`** — provides the `guardsOn(router, signature)` helper that resolves a route signature to the list of guard names applied to it.

## Notes

- The critical invariant being pinned here is that the stream route must **not** rely on a bearer header. If someone swaps `requireSessionViaCookieGuard` for `isAuth`, the SSE endpoint silently breaks in browsers — this test is the guard against that regression.
- The tests assert *absence* of guards as deliberately as they assert presence (e.g. no `requirePermissionGuard` on any route, no `isAuth` on `/stream`), so a newly added guard will fail the suite even if the "correct" guard is also present.
