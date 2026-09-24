---
source: src/modules/products/tests/integration/service.test.ts
sha256: a17ae06b0d35e83b0d7de49761e9c6771dad9e75e1f79eb057ee680f904bf822
generated_at: 2026-09-23T19:30:10.363142+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/service.test.ts

## Purpose

Integration tests for the `productService` module, exercising validation (`validateCreateData`, `validateUpdateData`), caller-scoped visibility rules on `search`/`getById`, and the create/update/remove flows including their side effects on the image store and on carts. Runs against a real test database with all domain modules registered, rather than in isolation.

## Key elements

- **`GUEST`, `LOGGED`, `ADMIN`** — three `Caller` contexts used to exercise the visibility rules; guest is `undefined`, the other two differ only by role.
- **`describe('productService.validateCreateData')`** — asserts the Zod-based create validator: required fields, min-length title, inclusive price minimum (`0`), type strictness (no coercion), fallback-locale presence, `uri-reference` vs `uri` for `imageUrl`, i18n message keys, and per-locale field pointers in `details.field`.
- **`describe('productService.validateUpdateData')`** — confirms that update is partial: a missing translations map or a non-fallback locale is legal, but `null` or `{}` for a locale is not.
- **`describe('productService.search')`** — one case per role (guest, logged, admin) asserting which products are visible, plus text and price-range filtering.
- **`jest.mock('@infrastructure/adapters/image-store')`** — stubs `imageStore.remove` so tests assert the service _calls_ its collaborator without pinning to a filesystem backend.
- **`setupTestDb()`** — provisions a real (ephemeral) database for the test run.
- **`afterEach → resetDomainEvents()`** — clears the global event-bus subscriptions so handler registrations do not leak across tests.
- **`FALLBACK_TRANSLATIONS`** — a valid `{ translations: { en: { title } } }` object spread into positive-path fixtures.

## Relationships

- **`src/modules/products/service.ts`** — the system under test; every `describe` block calls one of its exported functions.
- **`src/modules/products/tests/factories.ts`** — provides `createProduct` to seed the test database.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` for caller-context setup.
- **`src/modules/products/repository.ts`** — imported (likely for direct DB inspection or seeding in truncated sections).
- **`src/modules/products/model.ts`** — supplies the `ProductDocument` type used in assertions.
- **`src/kernel/registry.ts`** — `registerModules` wires the product, inventory, cart, delivery, account, users, and orders modules so inter-module side effects (e.g. cart cleanup on hard delete) are exercised.
- **`src/kernel/events.ts`** — `resetDomainEvents` prevents event-handler leakage between tests.
- **`src/infrastructure/http/response.ts`** — source of the `ResponseReject` type used in return-value assertions.
- **`src/modules/{inventory,cart,delivery,account,users,orders}/module.ts`** — registered so that cross-module event handlers (cart-item removal, inventory sync, etc.) fire during create/update/remove tests.

## Notes

- The image-store mock is intentional: asserting on `deleteFile(path)` would couple the test to the filesystem adapter and pass silently if the backend swaps to object storage.
- `guest` vs `logged` are identical except for identity; a visibility rule that accidentally treats them the same will still pass, so the tests rely on `callerScope` receiving a `Caller | undefined` rather than a boolean.
- The negative-price test exists because a prior `zod` `.extend()` override dropped the `minimum: 0` constraint; the test guards against regression.
- `imageUrl` must accept server-relative paths (e.g. `/uploads/…`); an absolute-URL assertion would reject every real upload.
- All i18n message assertions verify that `message` is human-readable copy (not a raw key) and that `details.field` names the exact input path (e.g. `translations.en.title`) so a form can highlight the correct field.
