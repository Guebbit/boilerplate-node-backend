---
source: src/modules/inventory/tests/contract/api.contract.test.ts
sha256: 4452a998317f931a50de6bdb8c0cb46d7be95543d2edbb44fb323c1447843872
generated_at: 2026-11-08T06:04:36.339993+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `/inventory` HTTP surface. Pins the observable response shapes (status codes, body fields, pagination `meta`, error codes) for every endpoint branch a caller can reach over HTTP, without re-testing internal transition rules (those live in the unit suite). The goal is to catch shape or status regressions before they leak to a front-end or downstream consumer.

## Key elements
- **`GET /inventory/levels`** — verifies the full listing (three counters per item, `meta.totalItems`/`totalPages`), the `lowOnly=true` filter, and `page`/`pageSize` pagination.
- **`GET /inventory/levels/{productId}`** — single-product read; asserts 200 body shape, 404 for both a valid-but-unknown id (`MISSING_ID`) and a malformed id string, and 403 for a `user`-role bearer.
- **`GET /inventory/movements`** — empty-ledger shape, pagination that preserves `totalItems` across pages, `reason` filter, and per-product narrowing with `onHandDelta`/`reservedDelta` fields.
- **`POST /inventory/levels/{productId}/receive`** — 200 with updated counters, 404 for unknown product, 422 for `quantity: 0`.
- **`POST /inventory/levels/{productId}/adjust`** — 200 for negative/positive delta, 409 (`INVENTORY_BELOW_RESERVED`) when delta would drop `onHand` below `reserved`, 422 (`VALIDATION_ERROR` on field `delta`) for zero.
- **`POST /inventory/reservations/sweep`** — 200 with `{ expired: 0 }` when nothing is due.
- **`GET /inventory/preorders`** — verifies the computed fields (`backorderLimit`, `backordered`, `held`, `paid`, `left`, `ordered`) for a product with a set allowance.
- **`PATCH /inventory/levels/:productId`** — sets `backorderLimit` and returns the updated level; also covers the no-op case.

## Relationships
- **`tests/support/contract.ts`** — imported as a side-effect (`@tests/contract`); presumably registers shared contract assertions or matchers used by `toMatchObject` calls throughout.
- **`tests/support/http.ts`** — supplies the `api()` HTTP client and the `authenticateAs` / `authenticateAsRole` helpers used to obtain bearer tokens for admin and user roles.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module level to seed/prepare the test database before any test runs.
- **`tests/support/ids.ts`** — exports `MISSING_ID`, a known-valid-format id that does not correspond to any document, used to exercise 404 branches.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds and persists a product fixture (with optional `onHand`, `reserved`, `releaseDate`, etc.) so inventory tests can start from a deterministic state.

## Notes
- The file is intentionally scoped to *HTTP-observable* behavior; transition invariants (e.g. "reserved can never exceed onHand") are asserted here only via their 409/422 surface, not via internal state inspection.
- `totalItems` in pagination `meta` reflects the full filtered result set, not the current page — tests assert this explicitly (e.g. `totalItems: 5` while `items.length` is 2) to pin that contract.
- The `@tests/contract` import has no local binding; it is a pure side-effect import, so removing it silently breaks every `toMatchObject`-based contract assertion.
- `PATCH /inventory/levels/:productId` uses a colon in the route description header but the actual request path uses the id value; the colon is only in the test's `describe` label.
