---
source: src/modules/orders/tests/unit/routes.test.ts
sha256: a9b93d4952b2fd2ad379ad03e76efc34df6e094d71715a4b89acf6e21b71763c
generated_at: 2026-10-29T05:00:04.051943+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/routes.test.ts

## Purpose

Structural unit test for the orders router. It verifies that the exact set of endpoints is mounted in the correct order, that authorization guards cover the right routes (and only the right routes), and that the middleware chain (cache headers, rate limits, route flags, product invalidation) is composed in the intended sequence.

## Key elements

- **`routeSignatures(router)`** – returns the ordered `METHOD /path` strings; used to assert the full endpoint list and to enforce that `/search` and `/export` precede `/:id` (preventing path shadowing).
- **`guardsOn(router, signature)`** – extracts the guard/middleware names attached to a specific route; used to assert presence or absence of `isAuth` and `requirePermissionGuard` per endpoint.
- **`chainOf(router, signature)`** – returns the full ordered middleware chain for a route; used to verify relative ordering (e.g. permission check before export budget), cache directives (`privateNoCache`, `noStore`), `invalidateCache([products])`, and `routeFlag(hardDelete)`.
- **Jest mocks** – `cache`, `route-flag`, and `rate-limit` middlewares are replaced via factories (`cacheMock()`, `routeFlagMock()`, `securityMock()`) supplied by the shared test-support module, so assertions inspect symbolic names rather than live infra.
- **`router`** (from `@modules/orders/routes`) – the SUT; all tests read its configuration statically without issuing HTTP requests.

## Relationships

- **`src/modules/orders/routes.ts`** – exports `router`, the object under test. This file never mocks it; it reads the real route table and middleware composition.
- **`tests/support/routes.ts`** – provides all four test helpers (`routeTable`, `routeSignatures`, `guardsOn`, `chainOf`) and the three mock factories consumed by the `jest.mock` calls.

## Notes

- **Intentional gaps are assertions, not omissions.** `POST /:id/cancel` is asserted to lack `requirePermissionGuard` (customer self-service); `GET /:id/invoice` and `/credit-note` are explicitly absent from this router (owned by the invoicing module).
- **Ordering matters.** `/search` and `/export` must appear before `/:id` in the route table or Express will match them as a parameterized `:id` route.
- **Cache rules are per-route and directional.** No shared Redis cache on any order read (user-scoped data, RFC 9111 §3.5); `privateNoCache` on GETs, `noStore` on POST /search. Product catalogue cache is invalidated on order creation and cancellation.
- **Hard delete is flag-gated.** Only `DELETE /:id/hard` carries `routeFlag(hardDelete)`; the softer `DELETE /:id` and bulk `DELETE /` must not.
- **`POST /:id/status-override` uses a distinct permission key** (`override:Order`), not the ordinary write key, so holding `update:Order` alone is insufficient.
