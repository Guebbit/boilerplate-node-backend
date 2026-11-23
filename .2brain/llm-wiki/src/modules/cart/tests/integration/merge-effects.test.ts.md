---
source: src/modules/cart/tests/integration/merge-effects.test.ts
source_sha256: 2e96a9a639ebd9774662d8c634f8ab73f10f91333472b92e3a8e67aeed54c97c
context_sha256: 2889ad431aa860298828ed87c2ab43f31120dd5e8e8d9b59525e6d68a12ae4d1
generated_at: 2026-11-22T04:40:15.878468+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/merge-effects.test.ts

## Purpose
Integration tests for the observable side effects of cart operations that the main merge-answer tests do not cover: the analytics events a merge emits, and the domain event announced when a product is removed from all carts. They guard against a dashboard series silently stopping, or an announcement firing with no recipients.

## Key elements
- **`jest.mock('@infrastructure/observability/analytics', ...)`**: replaces the analytics module with the real one, except `emitAnalyticsEvent` is wrapped in `jest.fn(actual.emitAnalyticsEvent)`. This is a recording wrapper rather than a `jest.spyOn`, because spyOn can't redefine the non-configurable CommonJS namespace property under the swc transform used by mutation runs.
- **`setupTestDb()`**: sets up the test database for the file.
- **`describe('a merge’s analytics')`**:
  - A merged line that creates a new cart line emits exactly one `CART_ITEM_ADDED` with `{ product_id, quantity }`.
  - A merged line that grows an existing line emits `CART_ITEM_UPDATED` with `{ product_id, quantity }`, not an add.
  - A merged line for a nonexistent product (`'000000000000000000000000'`) emits no analytics event.
- **`describe('productRemoveFromCartsById')`**:
  - A `beforeEach` calls `resetDomainEvents()`, resets the `announced` mock, and subscribes it to `CART_LINES_REMOVED` with `onDomainEvent`.
  - When a cart holds the product, the event payload is `{ userIds: [holder.id], productId, titles }`, announced once.
  - When no cart holds it, nothing is announced.

## Relationships
- **`cartService`** (`modules/cart/services`): the system under test, via `merge`, `addItemById` and `productRemoveFromCartsById`.
- **`cartAnalyticsEvents`** (`modules/cart/analytics`) and **`CART_LINES_REMOVED`** (`modules/cart/events`): the event names the assertions check against.
- **`@infrastructure/observability/analytics`**: the port that is mocked and observed.
- **`@kernel/events`**: provides `onDomainEvent` and `resetDomainEvents` for subscribing to and clearing domain events.
- **`@tests/*` support** (`setup-test-db`, `callers`, `ports`): provide DB setup, `testCallerContext`, and `observePort`, which obtains the mocked `emitAnalyticsEvent` for assertions.
- **User and product factories** (`modules/users/tests/factories`, `modules/products/tests/factories`): `createUser` and `createProduct` create the test data.

## Notes
- The analytics mock must be declared in this file with `jest.mock`; `observePort` is then applied to `analyticsPort.emitAnalyticsEvent` inside each test.
- `announced` is a shared `jest.fn()` reset in `beforeEach`, together with the domain event registry, to keep tests isolated.
