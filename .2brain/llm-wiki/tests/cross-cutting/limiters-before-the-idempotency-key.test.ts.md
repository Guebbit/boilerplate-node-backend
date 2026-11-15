---
source: tests/cross-cutting/limiters-before-the-idempotency-key.test.ts
sha256: eea82f5d9dc74da8ae5101cceb1fecf7baaab3d6d1494ef2d5e18da87d108bc0
generated_at: 2026-11-14T23:03:59.751053+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/limiters-before-the-idempotency-key.test.ts

## Purpose

Cross-cutting invariant test that enforces a single app-wide ordering rule: on every route, all rate-limiter middleware must be mounted **before** `idempotencyKey` / `requireIdempotencyKey`. If a limiter ran after the key was claimed, the ledger would store and replay a 429, and a retried client would receive the stale refusal indefinitely. The test reads the live route table, so any new keyed route or newly enabled module is covered automatically.

## Key elements

- **`KEY_CLAIMS`** — `Set` of the two middleware names that claim an idempotency key in the ledger (`idempotencyKey`, `requireIdempotencyKey`).
- **`keyedRoutes()`** — Flattens every module in `ROUTED_MODULES`, extracts `[routeLabel, guards[]]` tuples via `effectiveRouteTable` / `guardsOn`, and filters to only those routes whose guard list contains a key-claim. Returns mount-ordered guard names.
- **`jest.mock('@infrastructure/http/middlewares/rate-limit')`** — Replaces every limiter factory with a stub tagged via `Object.assign(fn, { [Symbol.for('tests.routeLabel')]: 'limiter:<namespace>' })`, so `guardsOn` can identify a budget by the `limiter:` prefix without a hardcoded allow-list.
- **`it('finds keyed routes to check')`** — Vacuity guard: fails if the route walker or the module registry stops producing keyed routes.
- **`it('recognises at least one budget on a keyed route')`** — Vacuity guard: fails if the tagging mechanism is broken so the main sweep would pass vacuously.
- **`it.each(keyedRoutes())`** — The actual sweep: for every keyed route, asserts that no guard with the `limiter:` prefix appears after the key-claim in mount order.

## Relationships

- **`tests/support/routes.ts`** — Provides `effectiveRouteTable` and `guardsOn` (the route-table walker and guard-reader the test uses to enumerate routes and their middleware order) and the shared mock factories (`cacheMock`, `routeFlagMock`, `storageMock`, `securityMock`) that this file's module mocks delegate to.
- **`tests/support/routed-modules.ts`** — Exports `ROUTED_MODULES`, the canonical registry of all enabled module routers. The test iterates this map, so adding a module there automatically extends coverage.

## Notes

- Limiter recognition relies on the **tag prefix** `limiter:` attached via `Symbol.for('tests.routeLabel')` (a shared-registry `Symbol`). A new limiter added to the `rate-limit` middleware must go through `buildRateLimiter` (or be explicitly tagged) to be picked up; no separate list needs editing.
- The two vacuity `it` blocks are intentional: without them, a regression that silently removes all keyed routes or breaks the tagging would turn the `it.each` sweep into a no-op that reports green.
- The rate-limit mock spreads the real `securityMock()` export first, so any non-limiter middleware in that module still resolves to its standard mock.
