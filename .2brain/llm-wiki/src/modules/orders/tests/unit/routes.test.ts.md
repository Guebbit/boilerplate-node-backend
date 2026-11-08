---
source: src/modules/orders/tests/unit/routes.test.ts
sha256: a78a1adb3d3f5d8a72a93a74f1ac42492ac48d99afe73f479668f2597080c232
generated_at: 2026-11-08T07:13:41.432940+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/routes.test.ts

## Purpose

Structural test for the orders Express router. It asserts the exact set and order of mounted endpoints, verifies which authorization and caching guards sit on each route, and checks middleware chaining (permission → budget → controller). The goal is to make any accidental route re-ordering, missing guard, or cache-policy drift a red test rather than a production bug.

## Key elements

- **`describe('order routes — what is mounted')`** — Asserts the full route-signature list (16 endpoints) and enforces that `/search` and `/export` are declared *before* `/:id` so they aren't swallowed by the parameterised route.
- **`describe('order routes — authorization')`** — Parameterised checks that every route carries `isAuth`; that admin-write routes carry `requirePermissionGuard`; that `POST /:id/cancel` deliberately does **not** (owner-scope lives in the service); and that `POST /:id/status-override` is gated by its own distinct permission key.
- **`describe('order routes — the export budget')`** — Confirms the `orders-export` budget middleware runs after `requirePermissionGuard` and before the controller.
- **`describe('order routes — staff notes')`** — Verifies both timeline-note routes require `update:Order` and that `POST` carries the `orders-note` budget in the correct chain position.
- **`describe('order routes — caching')`** — Ensures read routes use `privateNoCache` (never shared Redis), `POST /search` uses `noStore`, order creation/cancellation invalidate the `products` cache, and hard-delete is reachable only behind the `routeFlag(hardDelete)` guard.
- **`jest.mock` blocks** (top of file) — Stub out `cache`, `route-flag`, and `rate-limit` middlewares using factory helpers exported from `@tests/routes` so the router can be introspected without a live Redis or flag service.

## Relationships

- **`src/modules/orders/routes.ts`** — The module under test. This file imports its `router` export and introspects it via the helpers below.
- **`tests/support/routes.ts`** — Supplies the introspection utilities (`routeTable`, `routeSignatures`, `guardsOn`, `chainOf`) and the middleware factory mocks (`cacheMock`, `routeFlagMock`, `securityMock`) that the `jest.mock` calls delegate to via `requireActual`.

## Notes

- Route order is a load-bearing invariant: because Express matches in declaration order, moving `/search` or `/export` after `/:id` silently breaks those endpoints. The two ordering tests exist specifically to catch that regression.
- `POST /:id/cancel` lacking `requirePermissionGuard` is intentional, not a gap — authorization is enforced inside `orderService.cancelOnRequestById` via caller scoping. Adding the guard at the router level would remove the customer-facing cancel feature.
- The `jest.mock` factories call `requireActual('@tests/routes')` to obtain the mock helpers, meaning the test file has a runtime dependency on `tests/support/routes.ts` being resolvable at `@tests/routes` in both module resolution and the jest `moduleNameMapper`.
- Caching assertions reference RFC 9111 §3.5 semantics: order reads are user-scoped, so shared (Redis) caching is forbidden; only browser-level `private` caching is permitted.
