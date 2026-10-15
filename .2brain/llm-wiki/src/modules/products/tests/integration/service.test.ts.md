---
source: src/modules/products/tests/integration/service.test.ts
sha256: 9c9230204f4cbe92d169d2cdad0dd3d7835f2eaf0782547ce0c29ad51ce68d04
generated_at: 2026-10-15T11:49:18.985137+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/service.test.ts

## Purpose

Integration tests for `productService` covering caller-scoped visibility rules on `search`/`getById`, the `create`/`updateById` flows, and `remove` side-effects (image-store cleanup, cart cascade on hard delete, translation-port invocation). Uses a real database (`setupTestDb`) with mocked collaborators (image store, translation port) to verify service logic and wiring without external infrastructure.

## Key elements

- **`fakeTranslationPort(overrides?)`** – Factory returning a `TranslationPort` whose methods are pre-mocked jest fns; used to prove `remove` calls the port without a real translations collection.
- **`jest.mock('@infrastructure/adapters/image-store', …)`** – Replaces only `imageStore.remove` with a mock while preserving the real `applyImageWriteback` (a pure mutation the tests depend on).
- **`GUEST` / `LOGGED` / `ADMIN`** – Caller fixtures (`undefined`, customer, admin) that drive the three visibility tiers; a `warehouse` caller is also used inline.
- **`titlesOf`** – Extracts `title` strings from result items for readable assertions.
- **`describe('productService.search')`** – Visibility per role, text/price filters, pagination, soft-delete exclusion, batch-id filtering (silent absence, no 404).
- **`describe('productService.getById')`** – Role-based visibility, wire-shape check (no Mongoose `save` on the returned object), `undefined`-id guard.
- **`describe('productService.create')`** / **`describe('productService.updateById')`** – Happy-path insert and field-update assertions.
- **`afterEach → resetDomainEvents()`** – Prevents global event-subscription leakage between tests.

## Relationships

- **`src/modules/products/services/index.ts`** – The module under test; all assertions target its exported functions.
- **`src/modules/products/repository.ts`** – Imported as `productRepository`; used for `count()` assertions after create.
- **`src/modules/products/model.ts`** – `ProductDocument` type for casting update results.
- **`src/kernel/events.ts`** – `resetDomainEvents()` called in `afterEach`.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` (used in remove-cascade tests, likely in the truncated portion).
- **`src/kernel/translation.ts`** – `registerTranslationPort` / `TranslationPort` type for the fake port.
- **`src/infrastructure/http/response.ts`** – `ResponseReject` type imported for typing error-path assertions.
- **`src/modules/products/tests/factories.ts`** – `createProduct` for seeding rows.
- **`src/modules/users/tests/factories.ts`** – `createUser` for seeding caller identities.
- **`src/types/index.ts`** – `Caller` type and `testCallerContext`.
- **`tests/support/callers.ts`** – `callerAs` / `testCallerContext` helpers.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules` for cart-cascade tests.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the real test database.
- **`tests/support/stub.ts`** – `asStub` for type-narrowing assertions on wire shape.

## Notes

- The image-store mock deliberately targets the **interface** (`imageStore.remove`), not the filesystem, so the tests stay valid if the backend moves to object storage. `applyImageWriteback` is kept real via `jest.requireActual`.
- The translation port is a wiring double (same pattern as `orders/tests/unit/snapshot.test.ts`); it proves *that* the port is called, not *what* it returns.
- Assertions compare **titles** rather than counts so a failure identifies *which* visibility rule shifted, especially between the near-identical `guest` and `logged` tiers.
- `getById` is expected to return a plain wire object (Mongoose `toJSON` already applied) *before* any translation resolution; the `asStub` check for absent `save` enforces this.
- Batch-id search treats invisible/soft-deleted ids as **silently absent** from the page, not as errors.
