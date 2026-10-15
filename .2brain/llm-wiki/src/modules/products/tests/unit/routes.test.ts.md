---
source: src/modules/products/tests/unit/routes.test.ts
sha256: 88d46f78ce1eaba182dd79a353f8b07e063bd17f7d19f24226b548cc89e3c359
generated_at: 2026-10-15T11:50:07.547033+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/routes.test.ts

## Purpose

Structural regression tests for the product catalogue router. It asserts the full route table (signatures, order, middleware chains, cache tags, guard stacking, upload fields, and route flags) so that silent misconfigurations—dropped auth guards, a static path shadowed by `/:id`, a cache-tag rename on one side, or an unvalidated upload—fail in CI rather than in production.

## Key elements

- **Mock setup (top-level `jest.mock` calls):** Replaces `cache`, `route-flag`, and `upload` middleware factories with the mock versions exported by `tests/support/routes.ts` (`cacheMock`, `routeFlagMock`, `storageMock`). Hoisted before the router import so the router is built against mocks.
- **`TAG` constant (`'products'`):** The catalogue cache tag, stated once here. Used in cache assertions.
- **`describe('product routes — what is mounted')`:** Asserts the exact ordered list of 13 route signatures, that static paths (`/search`, `/categories`, `/settings`) are mounted before `/:id`, and that `getAuth` runs at router level.
- **`describe('product routes — the product page and its stock count')`:** Verifies `GET /:id` sets `browserRevalidate: true` on its `setCache` so browsers revalidate after a stock write.
- **`describe('product routes — authorization')`:** Parametrised checks that write/admin routes carry both an identity guard *before* `requirePermissionGuard`, that `POST /` / `PUT /:id` / `PATCH /:id` stack two permission keys, and that storefront-read routes carry no guard at all.
- **`describe('product routes — caching')`:** Confirms `GET /` and `POST /search` share one `keyAs`, that `GET /categories` and `GET /:id` are cached under the catalogue tag, that `GET /:id/admin` is **not** cached, and that every mutating route calls `invalidateCache(['products'])` (asserted as a literal string, deliberately).
- **`describe('product routes — uploads and flags')`:** Verifies image routes chain `upload.image` → `validateUploadedImages` → `quarantineUploadedImages`, and that the `hardDelete` flag is present only on `DELETE /:id/hard`.

## Relationships

- **`src/modules/products/routes.ts`** — the system under test. This file imports its `router` export and inspects every property of the built Express router.
- **`tests/support/routes.ts`** — provides the test-only helpers (`routeTable`, `routerMiddleware`, `routeSignatures`, `optionsOf`, `identityGuardIndex`, `chainOf`) and the three middleware mock factories used in the `jest.mock` calls. Without it the router cannot be imported in isolation.

## Notes

- Mocks are installed **before** the `import { router }` line. Because `jest.mock` is hoisted, the router is constructed with mocked middleware; any test that reads a real middleware would see production code.
- The cache-tag assertion in the "invalidates" block uses the **literal** string `'products'` rather than importing a shared constant. This is intentional: a rename of the tag in the routes file must make this test fail, not silently follow along.
- Route-order tests rely on Express's first-match-wins behaviour. If a new literal path is added after `/:id` without also being placed before it in the router, the "static before dynamic" test catches it.
- `identityGuardIndex` returns `-1` when no identity guard is present; the "stays public" assertions rely on that sentinel rather than a thrown error.
