---
source: src/modules/products/tests/contract/stock-visibility.contract.test.ts
sha256: 75419c1d42c9e562a5c74e1bb992e4c8002941448638bde63614f901fb3c6a24
generated_at: 2026-10-15T11:46:50.223731+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/contract/stock-visibility.contract.test.ts

## Purpose

Contract test asserting the stock-visibility boundary: every caller receives the boolean flags `inStock` / `lowStock`, but the exact counters (`onHand`, `reserved`, `available`) are exposed only to callers holding the `inventory.any.read` permission. It covers single-product reads, the low-stock threshold logic, list reads, and a cache-isolation guarantee.

## Key elements

- **`COUNTERS` / `FLAGS`** — module-level arrays naming the exact vs. visible stock fields; used throughout assertions.
- **`rows(response)`** — extracts `body.data.items` from a list response.
- **`dataOf(response)`** — extracts `body.data` from a single-resource response.
- **`describe("GET /products/{id} — the counters follow inventory.any.read")`** — parameterises over guest, customer, unverified, editor (hidden) and manager, warehouse, admin (visible); asserts counters are absent/present and flags are still correct.
- **`describe("inStock and lowStock")`** — verifies the empty-shelf case (both false), the threshold boundary (`onHand === threshold` → low, `onHand > threshold` → not low), and that the threshold is driven by `NODE_LOW_STOCK_THRESHOLD`.
- **`describe("GET /products — the list follows the same rule")`** — confirms counters are stripped from every row for guests and retained for stock readers; includes a cache-poisoning test.

## Relationships

- **`src/modules/products/tests/factories.ts`** — imports `createProduct` to seed products with specific `onHand` values.
- **`tests/support/contract.ts`** — imported for side-effects (likely configures the contract-test harness, e.g. response-schema validation or base URL).
- **`tests/support/environment.ts`** — imports `setEnvironment` to override `NODE_LOW_STOCK_THRESHOLD` per test.
- **`tests/support/http.ts`** — imports `api` (request helper) and `authenticateAsRole` (role-based bearer token).
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb`, called at module top to prepare a clean database.

## Notes

- The `@tests/contract` import is a bare side-effect import with no named bindings; it likely registers global test setup (schema checks, interceptors) before the file's own `describe` blocks run.
- **Cache isolation is explicitly tested**: the test warms the `/products` list cache as `admin` first, then asserts a subsequent guest request still receives no counters. This guards against a shared cache entry leaking privileged fields.
- The `editor` role is the intentional negative case: it holds every *product* key but deliberately lacks `inventory.any.read`, making it the boundary role for this permission.
- `setEnvironment` calls are **not** reset between tests by default; each test that needs a specific threshold sets it explicitly, so ordering matters if a future test omits the call.
- The low-stock threshold is described as "shared with the stock board," implying a single `NODE_LOW_STOCK_THRESHOLD` env var governs both this API response and a separate dashboard surface.
