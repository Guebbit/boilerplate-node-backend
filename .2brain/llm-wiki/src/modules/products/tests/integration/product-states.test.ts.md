---
source: src/modules/products/tests/integration/product-states.test.ts
sha256: f9167d4a015c5ad5a7443dc8e934af53e1c5c78d867cbe63507d8b52b704f083
generated_at: 2026-10-15T11:48:46.861267+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/product-states.test.ts

## Purpose

Integration tests that verify, over HTTP, how the two product visibility flags behave for anonymous shoppers versus staff: `active: false` hides a product entirely, while `purchasable: false` only removes it from sale but keeps it visible. Covers both the catalogue listing endpoint and the single-product endpoint.

## Key elements

- **`titlesOf(body)`** — extracts product titles from a catalogue response body, expecting the `{ data: { items: [{ title }] } }` shape.
- **`seedStates()`** — creates four products in parallel (via `Promise.all`) covering every combination of `active` × `purchasable`; returns them in a fixed array order the tests destructure by index.
- **`describe('GET /products, anonymously')`** — four cases: default listing excludes inactive products, `?purchasable=false` / `?purchasable=true` filter correctly, and inactive products stay hidden even when explicitly requested.
- **`describe('GET /products/:id')`** — three cases: off-sale product returns 200 with flags visible; inactive product returns 404 regardless of `purchasable`; an authenticated `editor` (staff) sees the inactive product.

## Relationships

- **`src/modules/products/tests/factories.ts`** — provides `createProduct`, the factory used to seed test data with specific `active` / `purchasable` flags.
- **`tests/support/http.ts`** — provides `api()` (an HTTP client for the test server) and `authenticateAsRole` (generates a bearer token for a given role, e.g. `editor`).
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, called at module scope to reset/prepare the test database before any test runs.

## Notes

- `setupTestDb()` runs once at import time (module level), not per test, so the entire `describe` block shares one database snapshot.
- Product ordering in `seedStates()` is positional (array index), not creation-time; tests destructure by index rather than by querying the DB.
- The `titlesOf` helper is intentionally lenient about the outer response wrapper but assumes a flat `items` array with a `title` field—no pagination or nested structures are handled.
- Staff visibility is tested only against the `editor` role; no other roles are exercised in this file.
- The file docblock links the canonical spec at `docs/modules/products.md#product-states`.
