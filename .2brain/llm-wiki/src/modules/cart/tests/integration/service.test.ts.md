---
source: src/modules/cart/tests/integration/service.test.ts
sha256: 69a2bbe6ca4d0f2a9909b98d891f0c16121fa0cd5c04df63921aa84d345d09e2
generated_at: 2026-10-14T15:17:49.421442+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/service.test.ts

## Purpose

Integration test suite for the cart service layer (`src/modules/cart/services/`). Runs against a real MongoDB instance (`setupTestDb`) to exercise behaviours that mocks cannot — specifically the guarded `upsertLine` writes in `cartRepository` that distinguish `set` vs `add` via `$set` vs `$inc`. Also pins the over-serialization contract on cart views, the per-user single-document shape (no per-line `_id`), live shipping-option pricing, and the checkout→email dispatch chain.

## Key elements

- **`EMPTY_CART`** — canonical empty-cart response shape (zeroed summary, `shipping.required: false`); reused as the expected value for badge reads on a fresh user.
- **`storedQuantity(userId, productId)`** — reads the persisted quantity directly from `cartRepository.findByUserId`, bypassing the service layer so assertions survive the Mongo round-trip.
- **`atDefault` / `atHardCap`** — wrappers around `withEnvironment` that pin `NODE_CART_LINE_MAX` to `10` (shipped default) or `999` (contract hard cap) so a developer's local `.env` cannot shift the bound under test.
- **`giveUserAnAddress(userId)`** — seeds a default address via `addressAdd`, required because `standard`/`express` shipping methods have `requiresAddress: true`.
- **`flush`** — `setImmediate`-based microtask drain; waits out the fire-and-forget `sendOrderPlacedEmail` chain before asserting on the mocked `enqueueEmail`.
- **`describe` blocks** — `cart storage`, `cartGet`, `cartGetForBadge`, `shipping (FA-D6/B3)`, and (truncated) checkout/confirmation cases. Each targets a specific seam: document lifecycle, read shaping, serialisation contract, live pricing, and the order-placed event→email path.

## Relationships

- **`src/modules/cart/services/index.ts`** — primary subject; all service functions under test (`cartGet`, `cartGetForBadge`, `cartItemSetById`, `cartItemAddById`, `cartItemRemoveById`, `cartRemove`, `cartShippingMethodSet`, `orderConfirm`, `cartService`, `productRemoveFromCartsById`) are imported from here.
- **`src/modules/cart/services/items.ts`** — the `set`-vs-`add` distinction (one private `upsertCartItem`, differing only in `$set` vs `$inc`) is the highest-risk seam this file guards.
- **`src/modules/cart/repository.ts`** — `cartRepository` is queried directly by helpers (`storedQuantity`, document-shape assertions) to verify what the service actually persisted.
- **`src/modules/cart/module.ts`** — imported as `cartModule` for module registration during test setup.
- **`src/modules/cart/services/checkout.ts`** — source of `orderConfirm`; the checkout→email dispatch chain is exercised here.
- **`src/modules/cart/services/cleanup.ts`** — source of `productRemoveFromCartsById`; tested for cross-cart cleanup on product deletion.
- **`src/modules/addresses/index.ts`** — `addressAdd` is called via `giveUserAnAddress` to satisfy `requiresAddress` shipping methods.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is mocked (`jest.mock`) so checkout tests assert *that* dispatch happened, not *what* was sent.
- **`src/infrastructure/adapters/logger.ts`** — imported as `logger`; used in test assertions or spy setup for error-path cases.
- **`src/infrastructure/i18n/index.ts`** — `t` function imported for verifying user-facing strings in responses.
- **`src/kernel/events.ts`** — `resetDomainEvents` / `emitDomainEvent` manage the domain-event bus; `PRODUCT_DELETED` emission triggers the cart-cleanup path under test.
- **`src/kernel/registry.ts`** — `registerModules` wires modules into the kernel for each test's environment.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `countOrders`, `findOrder` provide order fixtures and post-conditions for checkout assertions.

## Notes

- The file uses **real MongoDB**, not in-memory mocks. `setupTestDb()` is called at module scope. This is intentional: the behaviour under test lives in `cartRepository.upsertLine`'s guarded writes, which a mock cannot reproduce.
- `cartItemSetById` and `cartItemAddById` are **the** critical pair to test together — they share one private `upsertCartItem` and differ only in a single `$set` vs `$inc` operator. A collapsed mutation would be invisible in code review.
- `cartGetForBadge` returns `CartResponseItem` objects with `additionalProperties: false`; the test explicitly asserts `Object.keys` to catch over-serialisation (e.g., a leaked `product` field).
- `cartGet` **does** include the populated `product` field (it prices the cart); `cartGetForBadge` **must not**. These are intentionally different shapes.
- The `flush` helper is needed because `sendOrderPlacedEmail` is fire-and-forget; without it, the mock assertion can race the dispatch.
- Environment-variable pinning (`atDefault`, `atHardCap`) guards against a developer's `.env` silently changing the quantity ceiling during local test runs.
