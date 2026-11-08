---
source: src/modules/cart/tests/integration/service.test.ts
sha256: 209347a5d48b3eb3b9af4bf7e454b6cea376aaaf30320f8d94d33af673032184
generated_at: 2026-11-08T05:22:56.966666+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/service.test.ts

## Purpose

Integration tests for the cart service layer (`src/modules/cart/services/`). Targets the highest-risk seam in the module — `set` vs `add` sharing a single `upsertCartItem` where a collapsed `$set`/`$inc` silently multiplies or drops quantities — and pins the serialization contract (no extra keys, no per-line `_id`). Runs against a real Mongo instance (`setupTestDb`) because the guarded write logic in `cartRepository.upsertLine` is not observable through a mock.

## Key elements

- **`EMPTY_CART`** — canonical expected shape for every "no items" assertion (zeroed summary, `checkoutable: false`, no shipping options).
- **`storedQuantity(userId, productId)`** — reads the persisted line back from `cartRepository` so assertions verify what actually landed in Mongo.
- **`atDefault(body)` / `atHardCap(body)`** — run a test body under a pinned `NODE_CART_LINE_MAX` (10 or 999) via `withEnvironmentOverrides`, immune to a developer's local `.env`.
- **`giveUserAnAddress(userId)`** — creates a minimal Italian address so checkout-dependent cases don't each repeat the setup.
- **`buyerReadyToCheckOut()`** — builds a user + product + single cart line + `pickup` shipping method, the minimum state that passes all checkout preconditions.
- **`mailQueued()`** — polls (via `eventually` + `settleOutboxNudges`) until the mocked `enqueueEmail` has been called, decoupling the assertion from the outbox relay timing.
- **`describe('cart storage')`** — verifies document lifecycle: no doc until first write, single doc per user, `createdAt`/`updatedAt` stamps, and that a line is exactly `{ productId, quantity }` with no subdocument `_id`.
- **`describe('get')`** — verifies the populated-item read path, including that a deleted product yields `product: null` while `productId` is retained.
- **`describe('getForBadge')`** — verifies the lean read path: no `product` key at all (enforced by key-list assertion), correct multi-line summary math, and the `EMPTY_CART` fallback.

## Relationships

- **`src/modules/cart/services/index.ts`** — under test; provides `cartService` (the `set`/`add`/`get`/`getForBadge` API).
- **`src/modules/cart/repository.ts`** — used directly in assertions (`findByUserId`, `count`, `setShippingMethod`) to verify persisted state.
- **`src/modules/cart/module.ts`** — imported for module registration context in checkout-related tests.
- **`src/modules/addresses/index.ts`** / **`service.ts`** — `addressService.create` supplies the required shipping address for checkout-flow cases.
- **`src/modules/products/services/index.ts`** — `productService` used in product-deletion and catalogue-join scenarios.
- **`src/modules/products/index.ts`** — source of the `PRODUCT_DELETED` domain event constant.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `countOrders`, `findOrder` for checkout and post-order assertions.
- **`src/infrastructure/adapters/mailer.ts`** — mocked; the test asserts the *dispatch* happened, not the email body.
- **`src/infrastructure/adapters/logger.ts`** — imported for log-output assertions (or suppression) in error-path tests.
- **`src/infrastructure/i18n/index.ts`** — `t` used to assert localized error messages.
- **`src/infrastructure/i18n/context.ts`** — context setup for i18n assertions.
- **`src/kernel/events.ts`** — `resetDomainEvents` / `emitDomainEvent` to drive and clean up domain-event dispatch between tests.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` flushes pending outbox entries so the `mailQueued` helper can observe delivery.
- **`src/kernel/registry.ts`** — `registerModules` wires all dependent modules before the test suite runs.

## Notes

- **Real DB, not mocks.** The file's header comment explicitly states the guarded-write behaviour in the repository is unobservable through a mock; every `cartRepository` call hits the test Mongo.
- **Serializer contract is tested structurally.** `getForBadge` assertions check `Object.keys` against an exact list because `CartResponseItem` is `additionalProperties: false` — a stray key is a contract violation, not just a wrong value.
- **Environment pinning is deliberate.** `atDefault`/`atHardCap` exist so a developer's uncommitted `NODE_CART_LINE_MAX` in `.env` cannot shift the ceiling under test.
- **Mailer mock asserts dispatch, not content.** The queue is the contract; the email copy is pinned separately in the mailer template suite.
- **`EMPTY_CART` is the single source of truth** for the empty-state shape across the file; any change to the cart view must update this constant or the suite catches the drift immediately.
