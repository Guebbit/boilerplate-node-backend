---
source: src/modules/products/tests/contract/stock-visibility.contract.test.ts
sha256: ef931c9f23a25f35474df52493d84ab45327ff4d4d4f8d55e46ec52b75a4bf31
generated_at: 2026-11-08T07:49:51.301232+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/contract/stock-visibility.contract.test.ts

## Purpose

Contract test asserting that the three exact stock counters (`onHand`, `reserved`, `available`) are stripped from product responses for any caller lacking the `read:StockLevel` permission, while the two boolean flags (`inStock`, `lowStock`) remain visible to everyone. It covers single-product reads, list reads, threshold behaviour, and cache isolation.

## Key elements

- **`COUNTERS` / `FLAGS`** – Array constants naming the fields under test; used in every assertion.
- **`rows(response)`** – Extracts the `items` array from a list response body.
- **`dataOf(response)`** – Casts a response body to a flat record for single-item assertions.
- **`describe('GET /products/{id} — the counters follow read:StockLevel')`** – Parameterised tests over guest, customer, unverified, and editor (hides counters) vs. manager, warehouse, admin (shows counters with expected values).
- **`describe('inStock and lowStock')`** – Verifies flag logic: zero stock → both `false`; stock at threshold → `lowStock: true`; stock above threshold → `lowStock: false`; threshold is read from `NODE_LOW_STOCK_THRESHOLD`.
- **`describe('GET /products — the list follows the same rule')`** – Confirms counters are stripped from every row in a list for guests but present for stock readers, and that a stock reader's cached response does not leak counters into a subsequent guest response.

## Relationships

- **`tests/support/contract.ts`** – Imported as a side-effect (`import '@tests/contract'`) to register the shared contract-test infrastructure (matchers, global setup).
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module top level to provision a clean database before any test runs.
- **`tests/support/http.ts`** – Provides `api()` for building HTTP requests and `authenticateAsRole()` for obtaining role-scoped bearer tokens.
- **`tests/support/environment.ts`** – `setEnvironment()` is used to override `NODE_LOW_STOCK_THRESHOLD` per test case.
- **`src/modules/products/tests/factories.ts`** – `createProduct()` seeds products with a given `onHand` value for each scenario.

## Notes

- The security rationale is stated in the module docblock: exact counters leak sales velocity and could be used to plan inventory denial; hence they are permission-gated.
- The last test in the list block is a **cache-poisoning guard**: it warms the list cache with an `admin` response, then verifies a subsequent unauthenticated request still receives the stripped shape. This protects against a shared cache returning a privileged payload to a guest.
- Write-side assertions (POST/PUT/PATCH on products) are explicitly deferred to `tests/contract/product-write.test.ts`; this file only covers read visibility.
- The threshold value is described as "shared with the stock board," meaning other modules read the same `NODE_LOW_STOCK_THRESHOLD` env var; changing it here affects those consumers in the test environment.
