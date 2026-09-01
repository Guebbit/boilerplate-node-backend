# src/modules/products/tests/integration/service.test.ts

## Purpose

Integration test suite for `productService`, exercising validation (`validateData`), caller-scoped visibility (`search` / `getById`), and the create/update/remove flows against a real test database. It verifies business rules that depend on the full module graph (inventory, cart, delivery, etc.) rather than isolated unit behavior.

## Key elements

- **`jest.mock('@infrastructure/adapters/image-store', …)`** — stubs the `imageStore.remove` collaborator at the service boundary so tests assert on the handle contract, not on a specific filesystem/bucket backend.
- **`setupTestDb()`** — provisions an in-process MongoDB instance for the whole suite.
- **`afterEach(() => resetDomainEvents())`** — clears global event subscriptions between tests to prevent cross-test handler leakage.
- **`GUEST` / `LOGGED` / `ADMIN` caller constants** — the three identity tiers every visibility rule is tested against.
- **`describe('productService.validateData')`** — schema-level checks: title length, price bounds (negative rejected, zero accepted), type coercion of `active`/`categories`/`tags`, relative `imageUrl` acceptance, and i18n message integrity (no raw keys leaking to the client).
- **`describe('productService.search')`** — visibility by caller role, text/price filters, pagination metadata, and soft-delete exclusion for non-admins.
- **`describe('productService.getById')`** — per-role fetch rules (truncated in source).
- **`titlesOf` helper** — maps result arrays to a title-only array for stable, order-sensitive assertions.

## Relationships

- **`src/modules/products/service.ts`** — the unit under test; every assertion targets its exports (`validateData`, `search`, `getById`, `callerScope`).
- **`src/modules/products/index.ts` / `repository.ts` / `model.ts`** — re-exported through the barrel; `productRepository` and the `ProductDocument` type are used directly.
- **`src/modules/products/module.ts`** — registered via `registerModules` so the service can resolve its collaborators (repository, event emitters).
- **`src/modules/products/tests/fixtures.ts`** — provides `createProduct` to seed rows with controlled `active`/`deletedAt` states.
- **`src/modules/users/tests/fixtures`** — `createUser` (used in the truncated create/update/remove section).
- **`src/kernel/registry.ts`** — `registerModules` wires the six sibling modules (inventory, cart, delivery, account, users, orders) so cross-module side effects (e.g., cart cleanup on hard delete) are reachable.
- **`src/kernel/events.ts`** — `resetDomainEvents` isolates the global event bus between tests.
- **`src/infrastructure/http/response.ts`** — `ResponseReject` type imported for error-shape assertions.
- **`src/modules/{inventory,cart,delivery,account,users,orders}/module.ts`** — registered solely to satisfy the service's dependency graph; their internal logic is not directly asserted here.

## Notes

- The negative-price test documents a real regression: `zodProductSchema` used `.extend()` which **replaced** the `price` field rather than merging, silently dropping the `minimum: 0` constraint from `openapi.yaml`. The test guards the contract.
- `imageUrl` is validated as a `uri-reference` (relative paths like `/uploads/…` are valid), not an absolute `uri` — matching the contract and the upload flow.
- The i18n test asserts messages are not raw dotted keys (`/^[a-z]+(?:\.[\da-z-]+)+$/`), catching a prior bug where `user-validation.ts` referenced `signup.user-field-*` keys while the JSON bundle defined them under `login.*`.
- Assertions use `titles` rather than row counts so that a visibility-rule regression is visible as *which* product appeared, not just a number shift.
- The image-store mock deliberately targets the service's collaborator interface, not `fs.unlink` under it, so the suite keeps passing if the storage backend changes.
