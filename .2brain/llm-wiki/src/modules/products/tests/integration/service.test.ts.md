---
source: src/modules/products/tests/integration/service.test.ts
source_sha256: 6c5d799680059611aa12d152b025cfe0ad919feb0fe79bb858d57e10c78bc1b4
context_sha256: 3ffb95b401dfedb6e34c29b74578fb9729a4430aedc0637a4c8f6384bf373386
generated_at: 2026-11-22T07:18:05.521842+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/integration/service.test.ts

## Purpose
Integration tests for `productService`, run against a real test database. They cover input validation, the caller-scoped visibility rules of `search` and `getById`, and the create/update/remove flows. That includes side effects on the image store and, on hard delete, on every cart holding the product (per the module doc comment).

## Key elements
- **`fakeTranslationPort(overrides)`**: builds a `TranslationPort` double. Its methods are `jest.fn()` mocks with default resolved values (`resolve`, `removeAll`, `search`, `plan`, `write`, `readAll`, `readServed`, and `canPreviewDrafts` returning `false`). Tests override individual methods. It lets `remove`'s hard-delete cascade be tested as wiring (the service calls the port) without a real translations collection.
- **`jest.mock('@infrastructure/adapters/image-store')`**: keeps the real module (including `applyImageWriteback`, a pure mutation the tests use for real) and replaces only `imageStore.remove` with a mock resolving `true`. Tests assert on the stored-image handle (`imageUrl`), not on filesystem paths. The mocked `imageStore` is retrieved with `jest.requireMock`.
- **`setupTestDb()`**: sets up the test database.
- **`afterEach(resetDomainEvents)`**: clears global event subscriptions so handlers registered in one test don't leak into later ones.
- **Caller fixtures**: `GUEST` (`undefined`), `LOGGED` (customer), and `ADMIN` (admin), built with `callerAs`. `GUEST` and `LOGGED` differ by identity only.
- **`titlesOf`**: maps a result list to its titles, so assertions name which rows appeared rather than just counting them.
- **`describe('productService.search')`**:
  - Visibility: guests and signed-in non-admins see only active products. Admins and the `warehouse` role also see inactive ones, so the stock form can pick a draft. Soft-deleted rows are excluded for non-admins.
  - Filters and paging: text search (title and description), `priceMin`/`priceMax`, pagination with `meta.totalPages` and `meta.totalItems`, an empty collection, and batch `id` filtering. In the batch case a soft-deleted or missing id is silently absent, never a 404.
- **`describe('productService.getById')`**:
  - A published product is returned to a guest as a plain wire-shape object, not a Mongoose document.
  - An unpublished product is hidden from guests and non-admins (the result is `toBeNull()`) but shown to admins.
  - `undefined` is returned when no id is given.
- **`describe('productService.updateById')`**: checks that title, description (via `translations.en`) and price are updated, and that the `active` flag can be changed. It is called with `testCallerContext`. The file continues beyond what is documented here.

## Relationships
- Exercises `productService` from `src/modules/products/services/index.ts`. It also imports `productRepository` from `src/modules/products/repository.ts` and the `ProductDocument` type from `src/modules/products/model.ts`.
- Seeds data with `createProduct` (`src/modules/products/tests/factories.ts`) and `createUser` (`src/modules/users/tests/factories.ts`).
- Uses `tests/support` helpers via `@tests/*` aliases: `setup-test-db` (`setupTestDb`), `stub` (`asStub`), `callers` (`callerAs`, `testCallerContext`), and `checkout-modules` (`registerCheckoutModules`).
- Uses `src/kernel/events.ts` (`resetDomainEvents`), `src/kernel/outbox.ts` (`settleOutboxNudges`), and `src/kernel/translation.ts` (`registerTranslationPort`, `TranslationPort`).
- Imports the `ResponseReject` type from `src/infrastructure/http/response.ts` and the `Caller` type from `@types` (`src/types/index.ts`).

## Notes
- `productService.callerScope(caller)` takes a caller rather than a boolean, which is what lets guest and logged-in cases be tested separately.
- Calling `search` without a scope argument is also tested (pagination and empty-collection cases).
- Several imports (`createUser`, `productRepository`, `ResponseReject`, `settleOutboxNudges`, `registerCheckoutModules`, `registerTranslationPort`) are not used in the visible portion. They are presumably used by the later remove and create tests.
