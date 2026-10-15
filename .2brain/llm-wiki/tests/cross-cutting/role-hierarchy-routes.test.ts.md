---
source: tests/cross-cutting/role-hierarchy-routes.test.ts
sha256: 875fbace28c21f209084ab94ec0c6e54e3db968b4acfcfa67cec22f4645612b2
generated_at: 2026-10-15T12:40:27.618690+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/role-hierarchy-routes.test.ts

## Purpose

Guarantees bidirectional completeness between the mounted HTTP write routes of seven person-owned modules and the role-hierarchy accounting lists (`HIERARCHY_ROWS` + `UNOWNED_WRITES`). A new write route on any covered module fails this suite until someone classifies it, and a stale or duplicated entry in the lists also fails.

## Key elements

- **`COVERED_MODULES`** – The seven module names (`users`, `orders`, `delivery`, `payments`, `returns`, `api-keys`, `example`) whose write routes must be accounted for.
- **`WRITE_METHODS`** – `Set` of state-changing HTTP verbs (`POST`, `PUT`, `PATCH`, `DELETE`) used to filter the route table.
- **`mountedWrites()`** – Flattens `effectiveRouteTable` across all covered modules and returns every write route as a `"module METHOD path"` string.
- **Test: "lists every write route … as a row or as unowned"** – Asserts no mounted write is missing from the union of `HIERARCHY_ROWS` and `UNOWNED_WRITES`.
- **Test: "has no stale entry …"** – Asserts the reverse: every listed route actually exists in the mounted table.
- **Test: "never lists a route as both a row and unowned"** – Asserts no overlap between the two lists.
- **Test: "counts exactly 31 rows and 14 exemptions"** – A canary pinning exact totals (31 rows, 14 exemptions, 45 writes) so an accidentally emptied table cannot pass.

## Relationships

- **`tests/support/role-hierarchy-rows.ts`** – Source of `HIERARCHY_ROWS` (the rank-rule matrix) and `UNOWNED_WRITES` (exemptions with reasons). This test is the only consumer that checks their union against the live route table.
- **`tests/support/routed-modules.ts`** – Provides `ROUTED_MODULES`, the map from module name to its router instance, which `mountedWrites()` feeds into `effectiveRouteTable`.
- **`tests/support/routes.ts`** – Provides `effectiveRouteTable` (the function that extracts route entries from a router) and the mock-factory helpers (`cacheMock`, `routeFlagMock`, `storageMock`, `securityMock`) used by the `jest.mock` calls to neutralise infrastructure middlewares during route extraction.

## Notes

- The `jest.mock` calls resolve the mock factories *through* `@tests/routes` (the support file) rather than importing the infrastructure modules directly. This keeps the mocks co-located with the rest of the test-support layer.
- Route strings are always formatted as `` `${module} ${METHOD} ${path}` ``. When adding a new entry to `HIERARCHY_ROWS` or `UNOWNED_WRITES`, the key must match this exact format or the test will fail.
- The canary test hard-codes counts. Any legitimate addition to a covered module's routes **or** to the hierarchy lists requires updating these numbers in the same change.
