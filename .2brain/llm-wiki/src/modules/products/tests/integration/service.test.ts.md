---
source: src/modules/products/tests/integration/service.test.ts
sha256: 4540e99d8b81b7afdeaa8a64c322ef196f3bd16d2b67a615b52ee22f30317354
generated_at: 2026-09-27T15:35:15.549750+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/service.test.ts

## Purpose

Integration tests for the `productService` module, exercising validation (`validateCreateData`, `validateUpdateData`), caller-scoped `search`/`getById` visibility rules, and the create/update/remove flows including their side effects on the image store and (on hard delete) the carts holding the product. Runs against a real test database with port-level doubles for external collaborators.

## Key elements

- **`fakeTranslationPort(overrides?)`** — Builds a `TranslationPort` whose methods are jest mocks by default; used to prove that `remove`'s hard-delete cascade *calls* the port (a wiring fact) without a real translations collection. Same pattern as `orders/tests/unit/snapshot.test.ts`.
- **`jest.mock('@infrastructure/adapters/image-store', …)`** — Stubs only `imageStore.remove` (the filesystem half) while keeping `applyImageWriteback` (a pure mutation) real, so tests assert on the stored-image handle contract rather than a filesystem path.
- **`setupTestDb()`** — Initialises a real test database before the suite.
- **`afterEach(resetDomainEvents)`** — Clears global domain-event subscriptions to prevent handler leaks across tests.
- **`GUEST` / `LOGGED` / `ADMIN`** — Three caller constants (`undefined`, a customer, an admin) used by every visibility-rule test.
- **`FALLBACK_TRANSLATIONS`** — A minimal valid `{ translations: { en: { title: … } } }` object spread into positive-path inputs.
- **`describe('productService.validateCreateData')`** — Covers title length/absence, fallback-locale requirement, negative-price rejection, zero-price acceptance, wrong-typed `active`/`categories`/`tags`, undeclared translation fields, relative `imageUrl` acceptance, i18n message resolution, and per-locale field naming in error details.
- **`describe('productService.validateUpdateData')`** — Confirms partial updates (no translations, non-fallback-locale-only) pass, while `null` and empty-locale-object are rejected.
- **`describe('productService.search')`** — One case per role asserting on returned titles, verifying that guest and logged see only active products while admin sees all.
- *(Truncated section)* — create/update/remove flow tests, cart-cascade assertions, and image-store side-effect checks.

## Relationships

- **`src/modules/products/service.ts`** — System under test; every `describe` block calls its exported functions.
- **`src/modules/products/repository.ts`** — Imported directly (`productRepository`) for direct-DB assertions where the service's return shape is insufficient.
- **`src/modules/products/model.ts`** — Provides the `ProductDocument` type used in annotations.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds the test DB with known products.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds caller identities referenced by `asCustomer`/`asAdmin`.
- **`src/kernel/events.ts`** — `resetDomainEvents` prevents subscription leaks between tests.
- **`src/kernel/translation.ts`** — `registerTranslationPort` and the `TranslationPort` type shape the fake port.
- **`src/infrastructure/http/response.ts`** — `ResponseReject` type used in assertions on error payloads.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — `Caller` type for the three scope constants.
- **`tests/support/callers.ts`** — `asCustomer`, `asAdmin`, `testCallerContext` build the caller objects.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires the cart-cascade subscription so hard-delete tests can observe it.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the in-memory/test database.
- **`tests/support/stub.ts`** — `asStub` utility (used in the truncated portion).

## Notes

- **Image-store mock is deliberately narrow.** Only `remove` is stubbed; `applyImageWriteback` runs for real. This keeps the test contract on the *handle* (`imageUrl`) rather than a filesystem path, so a future bucket migration won't silently invalidate the test.
- **`GUEST` is `undefined`, not a sentinel object.** The service's `callerScope` distinguishes roles by the identity of the caller value, so guest vs. logged differ only by whether a user ID is present.
- **i18n-key assertion.** One test asserts that error messages never match the regex of a raw dotted key (e.g. `users.field-email-invalid`). A missing i18n key passes all other assertions because i18next falls back to returning the key string, which is still non-empty.
- **Price-constraint regression guard.** The negative-price test documents a past bug where `zodProductCreateSchema` used `.extend()` to override the `price` field for an i18n message, silently dropping the `minimum: 0` constraint from `openapi.yaml`. The test exists so the constraint can't be lost again.
- **`imageUrl` is a `uri-reference`, not a `uri`.** A dedicated test confirms server-relative paths (`/uploads/…`) are accepted, guarding against a future validator tightening to absolute URLs.
