---
source: src/modules/cart/tests/integration/service.test.ts
sha256: 25e7a92866627dbadd6c7bfb2218a86df67154a6a73979a31f006e26a4253e1c
generated_at: 2026-10-29T03:29:44.545056+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/service.test.ts

## Purpose

Integration tests for `cartService` against a real MongoDB instance. The file targets the highest-risk seam in the cart domain — the shared `upsertCartItem` path behind `set` vs `add` — and additionally pins the over-serialization guard on the cart view, the per-user single-document invariant, and the absence of per-line `_id`s. Real Mongo is used deliberately because the guarded writes in `cartRepository.upsertLine` cannot be exercised through a mock.

## Key elements

- **`EMPTY_CART`** — shared fixture describing the exact shape returned for a user with no cart (zeroed summary, `checkoutable: false`, empty shipping).
- **`storedQuantity(userId, productId)`** — reads the persisted quantity back from Mongo so assertions survive the round-trip.
- **`atDefault` / `atHardCap`** — wrap a test body in `withEnvironmentOverrides` pinning `NODE_CART_LINE_MAX` to `'10'` or `'999'` respectively, preventing a developer's local `.env` from shifting the ceiling.
- **`giveUserAnAddress(userId)`** — creates a default shipping address so checkout-dependent cases don't fail on the `requiresAddress` rule.
- **`buyerReadyToCheckOut()`** — composite fixture: user + address + one cart line + `pickup` shipping method.
- **`mockEnqueueEmail`** — jest mock of `enqueueEmail` from the mailer adapter; the queue (not the email copy) is what these tests assert on.
- **`mailQueued()`** — polls via `eventually` + `settleOutboxNudges` until the mocked mailer has been called (outbox relay delivers after commit).
- **`describe('cart storage')`** — verifies lazy document creation, `createdAt` stamp, line shape (no `_id`), single-document-per-user invariant, and `updatedAt` refresh.
- **`describe('get')`** — verifies populated product alongside lines, empty-list behaviour for missing users, and that a deleted product leaves `productId` intact with `product: null`.
- **`describe('getForBadge')`** — pins the `additionalProperties:false` contract (exact key set), summary arithmetic across lines, and zeroed summary for empty carts.

## Relationships

- **`src/modules/cart/services/index.ts`** — the system under test (`cartService`).
- **`src/modules/cart/repository.ts`** — `cartRepository` used directly for setup, assertions, and invariant checks (count, find, `setShippingMethod`).
- **`src/modules/cart/module.ts`** — `cartModule` registered via `registerModules` / `registerCheckoutModules` to wire the service in test context.
- **`src/modules/addresses/index.ts`** — `addressService.create` supplies the shipping prerequisite for checkout-path cases.
- **`src/modules/products/index.ts`** — `PRODUCT_DELETED` event emitted to test stale-line handling; `productService` for product lifecycle.
- **`src/modules/products/services/index.ts`** — `productService` used in deletion and availability scenarios.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `countOrders`, `findOrder` for checkout and order-linkage assertions.
- **`src/kernel/events.ts`** — `resetDomainEvents` (teardown) and `emitDomainEvent` (triggering `PRODUCT_DELETED`).
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` drains the outbox so mailer assertions are deterministic.
- **`src/kernel/registry.ts`** — `registerModules` boots the module graph for each test.
- **`src/infrastructure/adapters/mailer.ts`** — mocked at module level; the only external dependency that is stubbed.
- **`src/infrastructure/adapters/logger.ts`** — imported to silence or assert on structured log output.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — `t` used in assertions on localized user-facing messages (e.g. validation errors).

## Notes

- Only the mailer is mocked. Everything else (DB, services, events, outbox) runs for real; the file's comment block states explicitly that a mock cannot exercise `upsertLine`'s guarded writes.
- `EMPTY_CART` is a **hard-coded** shape constant, not derived from the service. If the view contract changes, this constant must be updated in lockstep or the test will falsely fail.
- The `atDefault`/`atHardCap` wrappers exist because `NODE_CART_LINE_MAX` is environment-driven; without pinning, a developer's local `.env` could silently change the tested boundary.
- The "no per-line `_id`" assertion uses `cart.toObject().items` (plain-object comparison) specifically to catch Mongoose's automatic `_id` injection, which a `toJSON` comparison might mask.
- `mailQueued` uses a polling pattern (`eventually` + `settleOutboxNudges`) rather than a fixed delay, making it resilient to CI timing variance.
