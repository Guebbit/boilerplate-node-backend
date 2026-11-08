---
source: src/modules/tasks/tests/unit/routes.test.ts
sha256: 8a043eec675e2e5a954eb2410eac527d610e30e196e7c598d4ccc67d851eaf6f
generated_at: 2026-11-08T08:41:49.547923+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/unit/routes.test.ts

## Purpose

Verifies that the tasks router exposes exactly the documented endpoints in the documented order, that the single public route (`POST /`) sits above the auth/permission gate while every other route sits below it, and that caching, rate-limiting, and the human-challenge gate are applied to the correct routes with the correct ordering. Assertions are deliberately positional because the routes below `router.use` are keyed by position.

## Key elements

- **`routeSignatures`, `guardsOn`, `identityGuardIndex`, `chainOf`** (imported from `@tests/routes`) — helpers that introspect the router instance: list signatures, extract guard names for a route, find the index of the first identity guard, and return the full middleware chain.
- **`jest.mock` for cache & rate-limit middlewares** — replaces both with mock factories (`cacheMock`, `securityMock`) obtained via `jest.requireActual('@tests/routes')`, so the chain contains identifiable placeholder names rather than real middleware.
- **`describe('what is mounted')`** — asserts the exact 12-element signature array in order.
- **`describe('the positional guard')`** — asserts `POST /` has no identity guard or `requirePermissionGuard`; asserts every other route has `getAuth`, an identity guard at index ≥ 0, and `requirePermissionGuard`. Includes a "sweep" test that iterates all non-`POST /` routes.
- **`describe('caching')`** — asserts `GET /` gets `privateNoCache` (no `setCache*`), and `POST /search` gets `noStore`.
- **`describe('submission rate limiting')`** — asserts the three `submission*` limiters appear on `POST /` before `postTask`, and on no other route.
- **`describe('human-challenge gate (rung 3)')`** — asserts `humanChallengeGate` appears on `POST /` after `submission-block`, and on no other route.

## Relationships

- **`src/modules/tasks/routes.ts`** — the system under test; provides the `router` instance whose middleware chains and route table are asserted here.
- **`tests/support/routes.ts`** — provides all four introspection helpers and the two mock factories (`cacheMock`, `securityMock`) that the `jest.mock` calls delegate to via `jest.requireActual`.

## Notes

- The ordering assertion and the guard assertion form a **pair**: either one alone would pass even if `router.use` were mistakenly mounted at index 0; together they pin the gate position.
- The "sweep" test for `requirePermissionGuard` filters `routeSignatures` to everything except `POST /` rather than listing routes, so a newly added route below the gate is covered automatically while one added above it fails the test.
- Mocks are wired through `jest.requireActual('@tests/routes')` — the test support module doubles as the mock-factory source, which is an unconventional but intentional coupling.
