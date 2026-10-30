---
source: src/modules/products/tests/integration/service.test.ts
sha256: c3d1d18f3437b954e28a3f81a11e7e355926ee1cf07d399ed92a3884d8984e0f
generated_at: 2026-10-29T05:33:55.239292+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/service.test.ts

## Purpose

Integration tests for `productService` covering three areas: caller-scoped visibility rules on `search` and `getById`, the create/update/remove mutation flows (including image-store side effects), and the hard-delete cart cascade. Runs against a real test database rather than unit-level mocks of the repository.

## Key elements

- **`fakeTranslationPort`** – Builds a `TranslationPort` double with jest-mocked methods (used as a port registration so `remove`'s hard-delete translation cascade is proven as a wiring fact without a real locales collection).
- **`jest.mock('@infrastructure/adapters/image-store')`** – Replaces only `imageStore.remove` with a mock; keeps `applyImageWriteback` real. The mock is extracted via `jest.requireMock` as `imageStore`.
- **`setupTestDb()`** – Initialises the shared in-memory/test database for the file.
- **`afterEach → resetDomainEvents()`** – Clears global event subscriptions so registering a handler in one test doesn't leak into subsequent tests.
- **`GUEST` / `LOGGED` / `ADMIN`** – Three `Caller` constants exercising the visibility matrix. `GUEST` is literally `undefined`; `LOGGED` and `ADMIN` differ only by role string.
- **`titlesOf`** – Small helper to map result items to their `title` strings for readable assertions.
- **`describe('productService.search')`** – Per-role visibility, text filter, `priceMin`/`priceMax` filters, pagination, soft-delete exclusion, and batch-id filtering (Tier A: invisible ids silently omitted, never a 404).
- **`describe('productService.getById')`** – Per-role visibility, undefined-id guard, and that the return value is the wire shape (Mongoose `save` absent).
- **`describe('productService.updateById')`** – Field updates (title, price, description via `translations`), `active` flag toggle, and image-URL swap verifying the old image is removed from the store. *(Truncated in the snippet; additional cases for remove/cascade likely follow.)*

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/products/services/index.ts` | System under test: `productService.search`, `.getById`, `.updateById`, `.callerScope` |
| `src/modules/products/tests/factories.ts` | `createProduct` – seeds rows for every test |
| `src/modules/users/tests/factories.ts` | `createUser` – seeds caller identities |
| `src/modules/products/model.ts` | `ProductDocument` type used in cast assertions on mutation results |
| `src/modules/products/repository.ts` | Imported (likely used indirectly or for direct assertion); the service delegates to it |
| `src/types/index.ts` / `src/types/auth-context.ts` | `Caller` type for scope constants and `testCallerContext` |
| `src/infrastructure/http/response.ts` | `ResponseReject` type for mutation-result union narrowing |
| `src/kernel/events.ts` | `resetDomainEvents` in `afterEach` cleanup |
| `src/kernel/outbox.ts` | `settleOutboxNudges` – settles outbox nudges (used in remove/cascade tests, below truncation) |
| `src/kernel/translation.ts` | `registerTranslationPort` + `TranslationPort` – injects `fakeTranslationPort` |
| `tests/support/callers.ts` | `callerAs`, `testCallerContext` – build the three caller identities |
| `tests/support/checkout-modules.ts` | `registerCheckoutModules` – registers cart/order modules so the remove-cascade path is wired |
| `tests/support/setup-test-db.ts` | `setupTestDb` – database lifecycle |
| `tests/support/stub.ts` | `asStub` – type-narrowing helper for asserting absence of Mongoose methods |

## Notes

- **Image-store mock boundary:** The mock targets `imageStore.remove`, not the filesystem or object-store adapter. Asserting on `deleteFile(publicPath + url)` would couple the test to the current backend; mocking the adapter keeps the test valid if images move to S3.
- **`applyImageWriteback` stays real:** Only the destructive `remove` half is stubbed; the pure mutation helper that writes `imageUrl` onto the document still executes for genuine coverage.
- **Visibility assertions use titles, not counts:** A mixed assertion (e.g. "length is 1") cannot say *which* rule moved. Comparing the exact title list pins the expectation to a specific product.
- **`guest` vs `logged` differ only by the presence of a `Caller` object**, not a boolean flag. A rule that accidentally switches on truthiness rather than role will pass the `guest` test but still hide items from `logged`—the test suite is structured so such a regression surfaces as a *different* failure, not a silent pass.
- **`getById` returns the wire shape:** The document's `toJSON` transform runs inside the service before translation resolution, so the result is a plain object (no `save`, no Mongoose internals). Tests assert this explicitly.
