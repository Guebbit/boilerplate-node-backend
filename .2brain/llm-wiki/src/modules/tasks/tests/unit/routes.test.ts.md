---
source: src/modules/tasks/tests/unit/routes.test.ts
sha256: b76b1a7071010bb104c6245b90a9077e80e5be26d58b503f6adc553bdc4bd0ab
generated_at: 2026-11-14T22:18:00.293429+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/unit/routes.test.ts

## Purpose

Unit tests that pin the exact route table, guard placement, caching policy, rate-limiting, and human-challenge gate of the tasks module's router. Because `router.use` makes guard boundaries positional and invisible to per-route inspection, these assertions are intentionally order-sensitive and sweep-based rather than per-route.

## Key elements

- **Route-table test** — asserts `routeSignatures(router)` equals a fixed 12-entry array in documented order.
- **Positional guard tests** — verify `POST /` is the sole unguarded (public) route above the `getAuth` + `requirePermissionGuard` gate; every other route carries both.
- **Ordering pin** — asserts `routeSignatures(router)[0] === 'POST /'` so the gate cannot be moved above the contact form.
- **Caching tests** — confirms `GET /` uses `privateNoCache` (browser-revalidated, no Redis) and `POST /search` uses `noStore`; neither uses any `setCache` variant.
- **Rate-limit tests** — asserts `POST /` carries exactly three limiters (`submissions`, `submission-identity`, `submission-block`) *before* `postTask`, and no other route references a `submission*` limiter.
- **Human-challenge gate tests** — asserts `humanChallengeGate` sits on `POST /` after `submission-block`, and on no other route.
- **Mocks** — `jest.mock` stubs for the cache and rate-limit middleware modules, both delegating to `cacheMock()` / `securityMock()` factories exported by `tests/support/routes.ts`.

## Relationships

- **`src/modules/tasks/routes.ts`** — the module under test; this file imports its `router` export and asserts against its full middleware graph.
- **`tests/support/routes.ts`** — supplies the four introspection helpers (`routeSignatures`, `guardsOn`, `identityGuardIndex`, `chainOf`) and the two mock factories (`cacheMock`, `securityMock`) consumed by the `jest.mock` stubs. All assertions and mock wiring in this file are built on that neighbor.

## Notes

- Assertions are **positional by design**: `router.use(getAuth, isAuthOrCredential)` means a guard applied via `use` is invisible to per-route queries unless you inspect the chain at the correct index. Per-route middleware checks alone would pass even if the gate were misplaced.
- The `jest.mock` factories are reached via `jest.requireActual('@tests/routes')`, keeping `tests/support/routes.ts` as the single source of truth for both the introspection helpers and the mock definitions used here.
- Rate-limiting dimensions (address, identity, address-block) are asserted as an exact triple, not a "contains" check, to catch accidental addition or reordering.
- The human-challenge gate is labeled "rung 3" in comments, implying a layered-defense model (rung 1 = rate limit, rung 2 = identity, rung 3 = challenge) that is not enforced elsewhere in this file.
