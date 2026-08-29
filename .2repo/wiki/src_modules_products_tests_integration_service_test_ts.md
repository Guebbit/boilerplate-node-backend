# src/modules/products/tests/integration/service.test.ts

## Purpose

Integration tests for the products service (`productService`), exercising `validateData`, `search`, and ` getById` against a real test database with all domain modules registered. The file guards the service's public contract: input validation rules (type, range, i18n message shape), role-based visibility (guest / logged / admin), filtering, pagination, and soft-delete exclusion.

## Key elements

- **`imageStore` mock** — `jest.mock` on `@infrastructure/adapters/image-store`; only `remove` is stubbed. Tests assert on the *handle* the service receives, not on filesystem calls, so a backend swap won't silently break coverage.
- **`GUEST` / `LOGGED` / `ADMIN`** — the three `Caller` shapes every visibility rule must handle. `GUEST` is `undefined`; `LOGGED` and `ADMIN` differ only by the `admin` flag, making them a minimal-difference pair for regression detection.
- **`titlesOf`** — small helper that maps `ProductDocument[]` to their titles, used to assert *which* rows a query returned rather than just a count.
- **`describe('productService.validateData')`** — covers: title length/missing, negative price (contract `minimum: 0`), zero price (inclusive bound), wrong-typed `active`/`categories`/`tags`, relative `imageUrl` acceptance, and that error messages are real translated strings (not raw i18n keys) with a `details.field` payload.
- **`describe('productService.search')`** — covers: role-based visibility (active-only for guest/logged, all for admin), text filter on title+description, `minPrice`/`maxPrice`, pagination metadata, empty collection, and soft-deleted row exclusion for non-admins.
- **`describe('productService.getById')`** — at minimum covers guest access to a published product (remainder truncated in source).
- **`setupTestDb()` / `resetDomainEvents()`** — database isolation per run and cleanup of global event subscriptions after every test.

## Relationships

- **`@modules/products/service.ts`** — the unit under test; all assertions target its exported functions.
- **`@modules/products/tests/factory.ts`** — provides `createProduct` to seed the test DB with controlled fixtures.
- **`@modules/users/tests/factory.ts`** — provides `createUser` (imported for cross-module scenarios).
- **`@kernel/registry.ts`** — `registerModules` wires all domain modules into the service container so integration tests exercise real inter-module subscriptions.
- **`@kernel/events.ts`** — `resetDomainEvents` prevents handler leakage between tests.
- **Module files** (`products`, `inventory`, `cart`, `delivery`, `account`, `users`, `orders`) — each module is registered so the products service can publish/subscribe domain events during tested flows.
- **`@infrastructure/http/response.ts`** — `ResponseReject` type imported for type-level assertions on error shapes.
- **`@modules/products/model.ts` / `@modules/products/index.ts`** — `ProductDocument` and `productRepository` types/instances used in fixtures and type imports.

## Notes

- The i18n-key assertion uses a *shape* regex (`/^[a-z]+(?:\.[\da-z-]+)+$/`) rather than matching specific copy, so it survives rewording. The `details.field` check ensures form-level highlighting data is present.
- Validation tests intentionally bypass any controller-level type coercion (e.g., `!!` on strings, `coerceStringArray` on numbers); they test the validator as the endpoint's last line of defence.
- The `price: 0` positive case documents that the OpenAPI contract uses an inclusive `minimum: 0`, and a prior bug (zod `.extend()` dropping the constraint) is guarded by the negative-price test.
- The file registers *all* sibling modules even though only products logic is asserted; this is intentional to catch accidental cross-module event side-effects during product writes.
