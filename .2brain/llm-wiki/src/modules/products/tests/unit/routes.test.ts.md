---
source: src/modules/products/tests/unit/routes.test.ts
sha256: c66681141254207fa050d57e093540f08a9aabfb90b6365529bb215af847199f
generated_at: 2026-11-08T07:54:25.469226+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/routes.test.ts

## Purpose
Route-table contract tests for the product catalogue router. Guards against silent failures a type checker cannot catch: a dropped auth guard, a static path shadowed by a later `/:id`, or a cache tag renamed on the writer but not the reader. Does not test handler logic—only what is mounted, in what order, and with what middleware chain.

## Key elements
- **`TAG`** – single-source constant (`'products'`) for the catalogue cache tag; asserted literally (not via import) so a rename fails here rather than propagating.
- **`describe('product routes — what is mounted')`** – asserts the exact ordered list of route signatures, that static segments (`/search`, `/facets`) precede `/:id` (Express first-match shadowing), and that `getAuth` is router-level middleware.
- **`describe('product routes — the product page and its stock count')`** – verifies `GET /:id` sets `browserRevalidate: true` so browsers revalidate after stock writes.
- **`describe('product routes — authorization')`** – parametrized checks: mutating routes require `getAuth` before `requirePermissionGuard`; write routes stack two `requirePermissionGuard` entries (products + translations); read routes carry no guard at all.
- **`describe('product routes — caching')`** – `GET /` and `POST /search` share the same `keyAs` and `keyParameters`; `previewDraftLanguage` is mounted before `setCache`; readers and writers both reference the `'products'` tag.
- **`describe('product routes — uploads and flags')`** – write routes include `upload.image` → `validateUploadedImages` → `quarantineUploadedImages`; the `routeFlag(hardDelete)` flag appears only on `DELETE /:id/hard`, never on `DELETE /:id`.

## Relationships
- **`src/modules/products/routes.ts`** – the sole SUT; its exported `router` is imported and inspected via the test-support helpers. No handler code runs.
- **`tests/support/routes.ts`** – provides all inspection utilities (`routeTable`, `routerMiddleware`, `routeSignatures`, `optionsOf`, `identityGuardIndex`, `chainOf`) and the three middleware factories that are replaced with mocks (`cacheMock`, `routeFlagMock`, `storageMock`). The `jest.mock` calls resolve to this module's exports, so the test never executes real middleware.

## Notes
- The three `jest.mock` calls use `jest.requireActual('@tests/routes')` to obtain mock factories from the support module—this is how the support file keeps test doubles co-located with the helpers that build them.
- The cache-tag assertion deliberately hard-codes `'products'` as a string literal in `invalidateCache` checks rather than referencing `TAG`; a rename in the source will fail this test instead of silently following along.
- Assertions are written against the full chain array (order-sensitive) rather than individual boolean checks, because the *position* of a middleware in the chain is what matters (e.g., `getAuth` before `requirePermissionGuard`, `previewDraftLanguage` before `setCache`).
