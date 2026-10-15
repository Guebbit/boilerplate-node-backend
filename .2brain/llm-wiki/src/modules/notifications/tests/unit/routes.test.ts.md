---
source: src/modules/notifications/tests/unit/routes.test.ts
sha256: fb260cc26baecad7aaf6054383b9b0a4c571cad86ad647b3444801da1fcaeec4
generated_at: 2026-10-15T10:53:34.406613+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/unit/routes.test.ts

## Purpose

Unit test that pins down the notifications router's public contract: the exact set and order of mounted endpoints, and the authentication guard each one uses. It exists to catch silent regressions in route ordering (literal vs. parametric segments) and to enforce that the SSE stream is cookie-authenticated rather than bearer-guarded.

## Key elements

- **`describe('notifications routes')`** — top-level suite; four assertions inside.
- **Endpoint signature test** — asserts `routeSignatures(router)` returns exactly `GET /stream`, `GET /`, `POST /read-all`, `POST /dismiss-all`, `DELETE /:id` in that order.
- **Bearer + permission guard test** (`.it.each`) — for every non-stream route, verifies both `isAuth` and `requirePermissionGuard` are present.
- **Stream cookie-auth test** — asserts `GET /stream` carries `requirePermissionViaCookieGuard` and does **not** carry `isAuth`.
- **Literal-before-parametric ordering test** — checks that `/dismiss-all` and `/read-all` indices are less than `/:id` in the route table.

## Relationships

- **`src/modules/notifications/routes.ts`** — the module under test; this file imports its exported `router` instance.
- **`tests/support/routes.ts`** — provides the shared helpers `routeTable`, `routeSignatures`, and `guardsOn` used to introspect the router without issuing HTTP requests.

## Notes

- Path aliases (`@tests/routes`, `@modules/notifications/routes`) are used instead of relative paths; keep them consistent when adding tests.
- The stream test is the only one that asserts a guard is **absent** (`not.toContain('isAuth')`). If a future refactor adds a generic auth guard to all routes, this test will fail intentionally — the `EventSource` API cannot send an `Authorization` header, so bearer auth on the stream is a hard no.
- The ordering test only checks two literal paths against `/:id`; it does not assert the full sequence. The full-order guarantee is covered by the signature-equality test above.
