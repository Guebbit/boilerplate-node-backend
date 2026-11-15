---
source: tests/cross-cutting/account-protection-routes.test.ts
sha256: 63a9d4e9a63fea677ac8beb62c23a1b7d19095d388ac2e09ec3de646ad48a021
generated_at: 2026-11-14T23:00:10.458885+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/account-protection-routes.test.ts

## Purpose

Guarantees that every state-changing (write) route mounted on the `users` module is explicitly accounted for in the account-protection matrix. A route must appear either as a row in `PROTECTION_ROWS` or as an entry in `UNOWNED_WRITES` with a justification; any unlisted write route causes the test to fail, and any listed route that is no longer mounted (or is listed twice) also fails. This keeps the protection matrix honest as routes are added or removed.

## Key elements

- **`WRITE_METHODS`** — `Set` of `POST | PUT | PATCH | DELETE`; the definition of "write" for this test.
- **`mountedWrites()`** — Collects every write route of the `users` module (via `routersOfModule` + `effectiveRouteTable`) and returns them as strings in the form `` `users ${method} ${path}` ``.
- **Test 1** (`lists every write route…`) — Asserts `mountedWrites()` ⊆ listed routes (no unclassified write).
- **Test 2** (`has no stale entry…`) — Asserts listed routes ⊆ `mountedWrites()` (no orphaned rows or exemptions).
- **Test 3** (`never lists a route as both…`) — Asserts `PROTECTION_ROWS` and `UNOWNED_WRITES` are disjoint on route keys.

## Relationships

- **`tests/support/account-protection-rows.ts`** — Source of `PROTECTION_ROWS` (the classified rows) and `UNOWNED_WRITES` (exemptions with reasons). This test is the completeness/liveness check for that file.
- **`tests/support/routed-modules.ts`** — Provides `routersOfModule('users')`, the entry point for discovering which routers belong to the `users` module.
- **`tests/support/routes.ts`** — Provides `effectiveRouteTable(router)`, which flattens a router into a list of `{ method, path }` entries consumed by `mountedWrites()`.

## Notes

- The `jest.mock` blocks target infrastructure middleware modules (`cache`, `route-flag`, `upload`, `rate-limit`) and source their factories from `@tests/routes` via `jest.requireActual`. This couples the mock definitions to the same support module that defines `effectiveRouteTable`.
- Route strings are the identity key across all three checks. If a route's spelling changes (e.g., a parameterised path format), both the support file and any manual entries in `PROTECTION_ROWS`/`UNOWNED_WRITES` must be updated in lockstep.
- The test only inspects the `users` module. Other modules are not checked here; the file docstring frames the rule as applying to "every write route on `users`".
