---
source: src/modules/products/tests/contract/actions.contract.test.ts
sha256: b4756e2e3a4b4ee68d62664c06476437205d51cff4877ef758cfdceec1691b1b
generated_at: 2026-11-14T21:29:33.545372+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/contract/actions.contract.test.ts

## Purpose

Contract tests for the `actions` object the server attaches to every product row/detail, verifying that the flag set (`update`, `delete`, `restore`, `hardDelete`) is role-aware, correct for live vs. deleted rows, and never leaks staff privileges into the guest-shared cache.

## Key elements

- **`NOTHING`** – constant `{ update: false, delete: false, restore: false, hardDelete: false }`; the expected actions for any unprivileged caller.
- **`actionsOfRows(response)`** – helper that maps a list response's `body.items` to their `actions` arrays.
- **`describe('GET /products — actions')`** – three tests:
  - Guest *and* customer see all-false flags on list rows.
  - Admin sees `delete: true` on a live product and `restore: true` (with `delete: false`) on a soft-deleted one.
  - Cache isolation: an admin GET that warms the cache must not cause a subsequent unauthenticated GET to return any `true` flag.
- **`describe('GET /products/{id} and the writes — actions')`** – two tests:
  - Detail endpoint returns all-false for a guest, full true-flags for admin.
  - `POST /products/{id}/restore` response carries the *live* product's actions (`delete: true`, `restore: false`).

## Relationships

- **`@tests/contract`** (`tests/support/contract.ts`) – imported for side-effects; registers the contract-test runner/environment.
- **`@tests/setup-test-db`** (`tests/support/setup-test-db.ts`) – `setupTestDb()` initialises a clean database before each test run.
- **`@tests/http`** (`tests/support/http.ts`) – provides `api()` (HTTP client) and `authenticateAsRole()` (bearer-token acquisition per role).
- **`@modules/products/tests/factories`** (`src/modules/products/tests/factories.ts`) – `createProduct()` seeds live and soft-deleted product rows for assertions.

## Notes

- The cache-leak test is the most subtle: it issues an admin GET *before* the guest GET specifically to populate the shared cache, then asserts the guest still receives `NOTHING`. Removing or reordering those two calls would silently disable the check.
- Soft-deleted rows (seeded with `deletedAt: new Date()`) are the only case where `restore` is `true` and `delete` is `false`; `hardDelete` stays `true` in both live and deleted states.
- The actions shape is a fixed four-key object; any server-side addition of a new flag must be mirrored here or the `toEqual` assertions will fail.
