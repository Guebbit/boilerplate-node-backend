---
source: tests/cross-cutting/account-protection-routes.test.ts
sha256: 68e39f8b323d6515a6d229dfb64e701ae0fed55ce607cef28333d7d0a934da59
generated_at: 2026-10-29T06:41:54.785821+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/account-protection-routes.test.ts

## Purpose

Guarantees that the account-protection matrix is **complete and non-overlapping**: every state-changing (write) route mounted on the `users` module must appear as either a `PROTECTION_ROWS` entry or a `UNOWNED_WRITES` exemption, and nothing listed may be stale or duplicated. The rule is only as strong as the route table it is asked against.

## Key elements

- **`WRITE_METHODS`** — `Set` of mutating HTTP verbs (`POST`, `PUT`, `PATCH`, `DELETE`) used to filter the route table.
- **`mountedWrites()`** — derives the canonical list of write routes for `users` from `effectiveRouteTable(ROUTED_MODULES.users)`, formatted as `"users ${METHOD} ${path}"`.
- **Test: "lists every write route … as a row or as unowned"** — asserts no mounted write route falls outside the union of `PROTECTION_ROWS` routes and `UNOWNED_WRITES` keys.
- **Test: "has no stale entry …"** — reverse check: every entry in the union must correspond to a currently mounted write (catches orphaned/deleted routes).
- **Test: "never lists a route as both a row and unowned"** — ensures mutual exclusivity between the two classifications.
- **Test: "counts exactly 10 rows and 2 exemptions"** — canary with hardcoded counts (10 rows, 2 exemptions, 12 total) so an accidentally emptied table cannot silently pass.

## Relationships

- **`tests/support/account-protection-rows.ts`** — source of `PROTECTION_ROWS` (the authoritative list of protected write routes) and `UNOWNED_WRITES` (exemptions with a documented reason). This test is the only consumer that enforces their completeness against the live route table.
- **`tests/support/routed-modules.ts`** — provides `ROUTED_MODULES.users`, which identifies which module's routes are in scope for the account-protection matrix.
- **`tests/support/routes.ts`** — provides `effectiveRouteTable` (the function that resolves a module into its mounted route entries) and the shared mock factories (`cacheMock`, `routeFlagMock`, `storageMock`, `securityMock`) re-used here via `jest.mock`.

## Notes

- The `jest.mock` calls use a non-obvious pattern: they `jest.requireActual` the routes-support module itself to obtain the mock factories, avoiding a circular import while still getting the canonical mock implementations.
- Route identity is the string `users ${METHOD} ${path}`. If the module name in `ROUTED_MODULES` changes, both `mountedWrites()` and every `PROTECTION_ROWS` / `UNOWNED_WRITES` entry must be updated in lockstep or the completeness test will fail.
- The canary test intentionally hardcodes counts. When a route is added or removed, **both** the support file and the expected count must be updated — this is by design to prevent silent deletions.
