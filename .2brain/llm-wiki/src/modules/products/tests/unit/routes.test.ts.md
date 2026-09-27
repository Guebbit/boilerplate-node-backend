---
source: src/modules/products/tests/unit/routes.test.ts
sha256: 6a8fa8367602da2ad8b1bf1960e6c6d177863bab013df71696ba4c4a26ecfbef
generated_at: 2026-09-27T15:35:28.381368+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/routes.test.ts

## Purpose

Structural contract tests for the product catalogue's Express router. They verify that the route table is mounted exactly as documented (no extra or missing endpoints), that static paths are ordered before parameterised ones, that authorization guards are present and correctly sequenced, that cache tags are consistent between readers and writers, and that upload/validation and route-flag middleware are in the right places. The file exists to catch regressions a type checker cannot: a dropped guard, a shadowed path, a renamed cache tag, or a misapplied upload field.

## Key elements

- **`TAG`** — the literal string `'products'`, asserted directly in cache-invalidation checks so a rename fails here rather than propagating silently.
- **`describe('product routes — what is mounted')`** — asserts the full ordered list of 12 route signatures, static-before-parameter ordering (`/search`, `/categories` < `/:id`), and router-level `getAuth` middleware.
- **`describe('product routes — authorization')`** — via `it.each(GUARDED)` verifies `getAuth` precedes `requirePermissionGuard` on every mutating route; confirms `POST /`, `PUT /:id`, `PATCH /:id` carry **two** `requirePermissionGuard` entries (products + translations); asserts public routes carry no identity guard.
- **`describe('product routes — caching')`** — asserts `GET /` and `POST /search` share the same `setCache` key (`products:search`), that `GET /categories` and `GET /:id` use the catalogue tag, and that every write route calls `invalidateCache([products])`.
- **`describe('product routes — uploads and flags')`** — checks `upload.image` + `validateUploadedImages` + `quarantineUploadedImages` on create/update/patch routes; confirms `routeFlag(hardDelete)` appears only on `DELETE /:id/hard` and is absent from `DELETE /:id` and `DELETE /`.
- **`jest.mock` blocks** (×3) — replace `cache`, `route-flag`, and `upload` middleware with factories from `@tests/routes` so the real side-effects never fire.

## Relationships

- **`src/modules/products/routes.ts`** — the unit under test. This file imports its `router` export and inspects every route's middleware chain, path, and cache options.
- **`tests/support/routes.ts`** — provides all test helpers (`routeTable`, `routerMiddleware`, `routeSignatures`, `optionsOf`, `identityGuardIndex`, `chainOf`) and the mock factories (`cacheMock`, `routeFlagMock`, `storageMock`) used in the three `jest.mock` calls. It is the canonical explanation for *why* those middleware are mocked.

## Notes

- Express matches routes in mount order; the first `/:id` shadows any later literal segment. The ordering test exists specifically to prevent that silent shadowing.
- Cache-invalidation assertions use the literal `'products'` string (not the `TAG` constant) deliberately — a rename must **fail** the test rather than tracking the constant.
- The `identityGuardIndex` helper returns the index of `getAuth` in a chain; `-1` means no auth middleware is present.
- `it.each` with a `GUARDED` array keeps the admin-guard list in one place; adding a new mutating route without adding it there is a test gap, not a test failure.
