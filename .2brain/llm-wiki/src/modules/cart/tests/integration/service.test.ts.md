---
source: src/modules/cart/tests/integration/service.test.ts
sha256: 395a8f45e70b1b5c50061c43a835e00e297099bdd33d12e3b30d3ae60718f50e
generated_at: 2026-11-14T19:35:24.363152+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/service.test.ts

## Purpose

Integration test suite for the cart service (`cartService`) that verifies the highest-risk seam in the cart domain: the `set` vs `add` distinction (backed by `$set` vs `$inc` in a shared private `upsertCartItem`). It also pins the over-serialization guard on `getForBadge`, the per-user single-document cart shape (no per-line `_id`), and the checkout/hold interaction rules. Runs against a real MongoDB instance rather than mocks, because the guarded write logic lives in the repository layer.

## Key elements

- **`EMPTY_CART`** – constant describing the full `getForBadge` response for a user with no items; used as the universal "nothing in cart" assertion target.
- **`storedQuantity(userId, productId)`** – helper that reads the persisted quantity directly from `cartRepository.findByUserId`, so assertions survive the Mongo round-trip.
- **`atDefault` / `atHardCap`** – wrappers around `withEnvironmentOverrides` that pin `NODE_CART_LINE_MAX_QUANTITY` to `'10'` or `'999'`, isolating tests from a developer's local `.env`.
- **`giveUserAnAddress`** – creates a standard IT address via `addressService.create`; required for `standard`/`express` shipping in checkout cases.
- **`buyerReadyToCheckOut`** – composes a user + address + one cart line + `pickup` shipping into a state where only a hold can block checkout.
- **`onHoldAtTheCap`** – extends the above with two pending orders and a moderator-set purchase hold, producing the exact precondition for the hold-rejection tests.
- **`mailQueued`** – polls (via `eventually` + `settleOutboxNudges`) until the mocked `enqueueEmail` has been called, verifying the outbox→commit→dispatch sequence.
- **`describe('cart storage')`** – verifies no document until first write, `createdAt` stamp, single-document-per-user invariant, line shape (no sub-document `_id`), and `updatedAt` refresh.
- **`describe('get')`** – covers empty/missing-user reads, populated product inclusion, and the deleted-product null-product case.
- **`describe('getForBadge')`** – asserts the exact key set (no `product` field) and multi-line summary computation.
- *(truncated sections)* – additional suites covering `set`/`add` semantics, quantity caps, checkout flow, purchase-hold rejection, and product-deletion events.

## Relationships

- **`src/modules/cart/services/index.ts`** (`cartService`) – the unit under test; every assertion calls its public methods (`get`, `getForBadge`, `setItemById`, `addItemById`, etc.).
- **`src/modules/cart/repository.ts`** (`cartRepository`) – used for direct-persistence assertions (`findByUserId`, `count`) and for test setup (`setShippingMethod`).
- **`src/modules/cart/module.ts`** (`cartModule`) – imported and registered via `registerModules` to wire DI.
- **`src/modules/orders/tests/factories.ts`** (`createOrder`, `toOrderItem`, `countOrders`, `findOrder`) – builds the pending-order and hold preconditions; also asserts order state after checkout.
- **`src/modules/addresses/service.ts`** (`addressService`) – creates the address required by standard/express shipping rules.
- **`src/modules/products/index.ts`** (`productService`, `PRODUCT_DELETED`) – product fixtures and the domain event emitted when a product is deleted mid-test.
- **`src/kernel/events.ts`** (`resetDomainEvents`, `emitDomainEvent`) – controls and inspects domain event emission (e.g. product-deletion propagation to the cart).
- **`src/kernel/outbox.ts`** (`settleOutboxNudges`) – flushes the outbox so that event-driven side effects (mailer dispatch) complete before assertions.
- **`src/kernel/registry.ts`** (`registerModules`) – registers cart and related modules for the DI container.
- **`src/infrastructure/adapters/mailer.ts`** (`enqueueEmail`) – mocked; the test verifies dispatch *timing* (outbox → commit), while the mailer template suite pins the *content*.
- **`src/infrastructure/adapters/logger.ts`** (`logger`) – imported for test-level log assertions or silencing.
- **`src/infrastructure/i18n/index.ts`** (`t`) – resolves i18n strings used in response assertions.

## Notes

- **Real Mongo, not mocks.** The module doc-block explicitly states that a mock cannot exercise the guarded writes in `cartRepository.upsertLine`; `setupTestDb` is called unconditionally.
- **Only the mailer is mocked.** `enqueueEmail` is replaced with `jest.fn()` so the test can assert *that* dispatch happened and *when*, without coupling to email content.
- **`set` vs `add` is the critical invariant.** They share one private `upsertCartItem`; the only difference is `$set` vs `$inc` on a single repository field. A regression here silently multiplies or zeroes a user's quantity and is invisible in code review — the tests exist specifically to pin that distinction.
- **Line items have no `_id`.** `CartItem` is `additionalProperties: false`; any generated Mongoose sub-document `_id` would be a contract violation. Tests assert the exact key set.
- **`getForBadge` must not include `product`.** An extra `product` key on `CartResponseItem` is a contract violation; the test enumerates allowed keys explicitly.
- **Environment variables are pinned per-test.** `atDefault`/`atHardCap` prevent a developer's local `.env` from shifting the quantity cap and silently changing test outcomes.
- **`EMPTY_CART` includes `checkoutable: false` and `shipping: { required: false, options: [] }`** — these are asserted as part of the empty-state contract, not as incidental fields.
