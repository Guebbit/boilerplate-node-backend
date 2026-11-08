---
source: src/modules/products/tests/integration/service.test.ts
sha256: 294dcfd6f9d66df07574466bacb361d86874119e55c884e715fa3f43c0bd3ff6
generated_at: 2026-11-08T07:52:56.886108+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/service.test.ts

## Purpose

Integration tests for `productService`: caller-scoped visibility rules on `search` and `getById`, CRUD field updates, and side-effect verification (image-store removal, hard-delete cart cascade). Runs against a real test database (`setupTestDb`) with collaborators stubbed at the port boundary rather than at the filesystem or collection level.

## Key elements

- **`fakeTranslationPort(overrides?)`** – Builds a `TranslationPort` double with all methods as jest mocks. Used to prove that `remove`'s hard-delete path *calls* the translation port (wiring fact) without a live locales collection.
- **`jest.mock('@infrastructure/adapters/image-store', …)`** – Replaces only `imageStore.remove` with a mock; keeps `applyImageWriteback` (a pure in-memory mutation) real. Asserts on the stored-image handle, not the filesystem path.
- **`GUEST` / `LOGGED` / `ADMIN`** – Three `Caller` scopes covering every visibility rule. `GUEST` is `undefined`; `LOGGED` and `ADMIN` differ by role string only.
- **`titlesOf(items)`** – Extracts the `title` field from result items so assertions name *which* row moved rather than just asserting a count.
- **`describe('productService.search')`** – Per-role visibility (guest, logged, admin, warehouse), text filter, `priceMin`/`priceMax`, pagination, empty-collection guard, soft-delete exclusion, and batch-id filtering (invisible ids silently omitted, never 404).
- **`describe('productService.getById')`** – Single-fetch visibility: published visible to all, unpublished hidden from guest/logged, visible to admin; `undefined` id returns `undefined`.
- **`describe('productService.updateById')`** – Field updates (title, price, description via `translations`), `active` flag toggle, and image-store `remove` invocation on `imageUrl` change.
- **(truncated section)** – Presumed `remove` / hard-delete cascade tests exercising the translation port double and outbox.

## Relationships

- **`@modules/products/services/index.ts`** – SUT; imports `productService` (search, getById, updateById, remove, callerScope).
- **`@modules/products/repository.ts`** – Imported as `productRepository`; likely used directly for seed assertions or to verify persistence side-effects.
- **`@modules/products/model.ts`** – `ProductDocument` type for cast/shape assertions.
- **`@modules/products/tests/factories.ts`** – `createProduct` seeds rows in the test DB.
- **`@modules/users/tests/factories.ts`** – `createUser` creates the caller identities.
- **`@kernel/events.ts`** – `resetDomainEvents()` in `afterEach` prevents subscription leaks between tests.
- **`@kernel/outbox.ts`** – `settleOutboxNudges` flushes queued outbox entries after each operation.
- **`@kernel/translation.ts`** – `registerTranslationPort` swaps the port for `fakeTranslationPort`; `TranslationPort` type shapes the double.
- **`@infrastructure/http/response.ts`** – `ResponseReject` type used in error-path assertions (update/remove failure cases).
- **`@types` (index / auth-context)** – `Caller` type and `callerAs` / `testCallerContext` from `@tests/callers` build the request context.
- **`@tests/checkout-modules`** – `registerCheckoutModules` wires cart-related domain modules so the hard-delete cart-cascade path is reachable.
- **`@tests/setup-test-db`** – `setupTestDb` provisions the in-memory/ephemeral database before the suite runs.
- **`@tests/stub`** – `asStub` helper for type-safe access to mock internals.

## Notes

- The image-store mock intentionally keeps `applyImageWriteback` real (it mutates the in-memory document) and mocks only `remove`. This keeps tests valid if the backing store moves from local disk to an S3 bucket.
- `fakeTranslationPort` exists so the test proves *wiring* (the service calls the port) without requiring a live locales collection. The same pattern appears in `orders/tests/unit/snapshot.test.ts`.
- Visibility assertions compare **titles**, not counts, so a regression that swaps *which* rule applied (e.g., role check vs. `deletedAt` check) fails with a readable diff.
- Batch-id search (`id: [id1, id2, id3]`) silently omits invisible/soft-deleted rows from the page result; it never returns a 404. Tests assert the surviving subset.
- `afterEach` calls `resetDomainEvents()` because event subscriptions are global; omitting it leaks handlers into every subsequent test.
