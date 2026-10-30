---
source: src/modules/products/tests/contract/stock-visibility.contract.test.ts
sha256: ef931c9f23a25f35474df52493d84ab45327ff4d4d4f8d55e46ec52b75a4bf31
generated_at: 2026-10-29T05:31:15.003961+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/contract/stock-visibility.contract.test.ts

## Purpose

Contract test asserting the stock-visibility rule on product reads: every caller receives the boolean flags `inStock` and `lowStock`, but the exact counters (`onHand`, `reserved`, `available`) are exposed only to callers holding the `read:StockLevel` permission. Covers both the single-product endpoint and the list endpoint, including cache-isolation behavior.

## Key elements

- **`COUNTERS` / `FLAGS`** — module-level constants naming the three restricted counter fields and the two always-visible flag fields, used to assert field presence/absence.
- **`rows(response)`** — helper that extracts `body.items` from a list response.
- **`dataOf(response)`** — helper that casts `body` to a plain object for single-item assertions.
- **`describe('GET /products/{id} …')`** — parameterises over guest, customer, unverified, and editor (all lack the stock key → counters absent, flags present) and over manager, warehouse, admin (all hold the stock key → counters present with expected values).
- **`describe('inStock and lowStock')`** — verifies flag semantics: `onHand = 0` → both flags false; `lowStock` is true **at** the threshold and false **above** it; threshold is read from `NODE_LOW_STOCK_THRESHOLD`.
- **`describe('GET /products — the list follows the same rule')`** — confirms counters are stripped from every row for a guest but present for a stock reader; includes a cache-isolation test ensuring a prior stock-reader response does not leak counters into a subsequent guest's cached list.

## Relationships

- **`tests/support/contract.ts`** — imported for side-effect (`@tests/contract`); bootstraps the shared contract-test infrastructure (assertion helpers, global setup).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the test database before any test runs.
- **`tests/support/http.ts`** — provides `api()` (HTTP client factory) and `authenticateAsRole(role)` (returns a bearer token for the given role).
- **`tests/support/environment.ts`** — `setEnvironment()` overrides `NODE_LOW_STOCK_THRESHOLD` to drive threshold-related assertions.
- **`src/modules/products/tests/factories.ts`** — `createProduct({ onHand, … })` seeds products with controlled stock levels.

## Notes

- The module doc comment names `tests/contract/product-write.test.ts` as the companion for write-path stock assertions; this file covers reads only.
- The cache-isolation test (guest reads after an admin read) guards against a server-side response cache returning a stock-reader's payload to an unauthenticated caller — a subtle security boundary.
- `lowStock` uses an **inclusive** threshold: `onHand === NODE_LOW_STOCK_THRESHOLD` yields `lowStock: true`; `onHand` one above it yields `false`.
- The `editor` role is explicitly called out as holding every product key *except* the stock key, making it the critical negative case for the permission gate.
