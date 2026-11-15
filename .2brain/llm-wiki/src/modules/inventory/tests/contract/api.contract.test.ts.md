---
source: src/modules/inventory/tests/contract/api.contract.test.ts
sha256: 61201618cb05f26218061bc89df1ccd06cfa62e15ab4776d29cb0ab5a2f7859d
generated_at: 2026-11-14T20:08:12.790158+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/contract/api.contract.test.ts

## Purpose
Contract tests that pin every HTTP-level branch of the `/inventory` API surface: the two read endpoints, the two write transitions (receive, adjust) with their 200/404/409/422 responses, the reservation sweep, and the preorders list. The transition *rules* (e.g. reservation invariants) are covered in the unit suite; this file only asserts what a client sees over the wire—status codes, response shapes, and meta envelopes.

## Key elements

- **`describe('GET /inventory/levels')`** — Asserts the paginated list response: all three counters (`onHand`, `reserved`, `available`), the `lowOnly=true` filter, pagination (`page`/`pageSize`), and the `backorderLimit: 0` default when the cap was never written.
- **`describe('GET /inventory/levels/{productId}')`** — Single-product read; 404 for both a nonexistent ID and a malformed (non-UUID) path segment.
- **`describe('GET /inventory/movements')`** — Ledger endpoint: empty-state contract, pagination where `totalItems` reflects the *full* filtered set (not the page), filtering by `productId` and `reason`, and the replayable delta fields (`onHandDelta`, `reservedDelta`).
- **`describe('POST /inventory/levels/{productId}/receive')`** — Success returns updated counters; 404 for unknown product; 422 for a zero/negative quantity.
- **`describe('POST /inventory/levels/{productId}/adjust')`** — Bidirectional correction (positive and negative `delta`); 409 with code `INVENTORY_BELOW_RESERVED` when the correction would drop `onHand` below `reserved`; 422 with `VALIDATION_ERROR` on `delta: 0`.
- **`describe('POST /inventory/reservations/sweep')`** — Returns `{ expired: 0 }` when nothing is due.
- **`describe('GET /inventory/preorders')`** — Lists products with a `backorderLimit` and a future `releaseDate`; verifies the response item shape (truncated in source).
- **`setupTestDb()`** — Called once at module scope to isolate the test database.
- **`import '@tests/contract'`** — Side-effect import; registers contract-match globals (e.g. response-shape assertions) for the whole file.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is invoked before any test to create an isolated database for the suite.
- **`tests/support/http.ts`** — Provides `api()` (supertest-like request builder), `authenticateAs('admin')`, and `authenticateAsRole` for attaching bearer tokens to every request.
- **`tests/support/contract.ts`** — Imported as a side-effect; likely installs global expect matchers or response-envelope assertions used throughout.
- **`src/modules/products/tests/factories.ts`** — `createProduct()` seeds product documents with arbitrary `onHand`, `reserved`, and `releaseDate` values used by nearly every test.
- **`tests/support/ids.ts`** — `MISSING_ID` is a well-known non-existent identifier used in 404-path tests.
- **`src/modules/inventory/model.ts`** — `stockLevelModel` is imported and used to perform a raw `collection.updateOne` with `$unset` on `backorderLimit`, allowing the test to verify the schema-default behavior through the API rather than through direct model calls.

## Notes

- The `backorderLimit` default test uses a raw `collection.updateOne` with `$unset` because the Mongoose schema would re-inject its default on save. This is the only place the file touches the model directly; all other interactions go over HTTP.
- Every mutating `POST` sends an `Idempotency-Key` header (a fresh `randomUUID()`). Omitting it would likely be rejected by the API layer.
- `meta.totalItems` is asserted against the *entire* filtered result set, not the current page. The inline comment calls this out as deliberate: an audit reader needs to know more history exists.
- The doc-comment at the top states that 401/403 assertions ("keep the counters off a customer's screen") are also in scope, and `authenticateAsRole` is imported for that purpose; those tests appear in the truncated portion of the file.
- The file is `@module`-scoped (no named exports). It is a pure test entry point discovered by the test runner via its path.
