---
source: src/modules/cart/tests/integration/service.test.ts
sha256: 2d2b334269a27243929a9682fa0f33c04010a735281731a354aeed6786a9942d
generated_at: 2026-09-23T18:33:50.758957+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/service.test.ts

## Purpose

Integration test suite for the cart service layer (`src/modules/cart/services/`). It exercises the highest-risk seam in the module — the shared private `upsertCartItem` behind `set` (absolute quantity via `$set`) and `add` (increment via `$inc`) — against a real MongoDB instance, because a mock cannot reproduce the guarded-write semantics of `cartRepository.upsertLine`. It also pins two contract invariants: the cart is a single per-user document with no per-line `_id`, and `CartItem` serialises to exactly `{ productId, quantity }` with no extra keys.

## Key elements

- **`setupTestDb()`** — spins up a real Mongo instance for the entire suite; no in-memory substitute.
- **`mockEnqueueEmail`** — mocked `enqueueEmail` from the mailer adapter; the test asserts *that* a confirmation email was dispatched, not *what* it contains.
- **`renderInvoicePdfMock`** — replaces the real PDF renderer so Chromium is never launched; the mock resolves `undefined` ("nothing to attach").
- **`flush()`** — a `setImmediate`-based helper that drains the fire-and-forget microtask chain of `sendOrderPlacedEmail` before assertions on the mailer mock run.
- **`EMPTY_CART`** — canonical shape `{ items: [], summary: { itemsCount: 0, totalQuantity: 0, total: 0 } }` used in empty-state assertions.
- **`storedQuantity()`** — reads the persisted quantity back from Mongo so assertions survive the round-trip (guards against in-memory-only state).
- **`describe('cart storage')`** — pins document lifecycle: no cart until first write, `createdAt` stamping, single-document-per-user invariant, no per-line `_id`, `updatedAt` refresh.
- **`describe('cartGet')`** — read path with populated product; includes the "product deleted → `product` is null but `productId` survives" case.
- **`describe('cartGetForBadge')`** — read path *without* populated product; asserts exact key set (`['productId','quantity']`) to enforce the `additionalProperties: false` contract; checks summary math with deliberately distinct numbers.
- **`describe('cartItemSetById')`** — the `set` vs `add` discriminator: after setting 5 then setting 2, quantity must be 2 (not 7).
- **`registerModules(...)`** — wires cart, inventory, products, users, orders, account, and delivery modules into the kernel registry so cross-module event handlers (e.g. `PRODUCT_DELETED` → `productRemoveFromCartsById`) are active.

## Relationships

- **`src/modules/cart/services/items.ts`** — the primary unit under test; `cartItemSetById`, `cartItemAddById`, `cartItemRemoveById` all delegate to the shared `upsertCartItem`.
- **`src/modules/cart/services/checkout.ts`** — `orderConfirm` is exercised to verify the email-dispatch side-effect.
- **`src/modules/cart/services/cleanup.ts`** — `productRemoveFromCartsById` is invoked via the `PRODUCT_DELETED` domain event.
- **`src/modules/cart/repository.ts`** — `cartRepository` is queried directly (not through the service) to assert persisted shape.
- **`src/kernel/registry.ts`** — `registerModules` assembles the module graph for cross-module event routing.
- **`src/kernel/events.ts`** — `resetDomainEvents` / `emitDomainEvent` drive the `PRODUCT_DELETED` flow.
- **`src/infrastructure/adapters/mailer.ts`** — mocked; the test's assertion target for checkout side-effects.
- **`src/infrastructure/adapters/logger.ts`** — imported; presumably used for error-path assertions (truncated section).
- **`src/infrastructure/i18n/index.ts`** — `t` is imported for localised error-message assertions.
- **`src/modules/account/module.ts`, `src/modules/delivery/module.ts`, `src/modules/inventory/module.ts`** — registered so their event subscriptions and service wiring are live during checkout/cleanup tests.

## Notes

- The file deliberately uses **real Mongo** (`setupTestDb`) rather than mocks because the behavioural contract lives in the repository's guarded `$set`/`$inc` writes; a mock would collapse `set` and `add` into the same call.
- `renderInvoicePdf` is mocked *only* to avoid launching Chromium mid-test; the rest of the invoice module is loaded via `jest.requireActual`, so any other exported helper still runs its real code path.
- The `flush()` pattern exists because `sendOrderPlacedEmail` is fire-and-forget: `orderConfirm` returns before `enqueueEmail` is called. Without `await flush()` the mailer mock may not have been invoked yet when the assertion runs.
- `MISSING_ID` is a structurally valid ObjectId that exists in no collection; it is used to confirm read-path graceful degradation (returning empty, not throwing).
- The summary test uses 2 × 25 + 3 × 10 = 80 with `itemsCount: 2, totalQuantity: 5` specifically so that a transposition bug in any of the three fields is immediately visible.
