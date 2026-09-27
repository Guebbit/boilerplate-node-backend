---
source: src/modules/cart/tests/integration/service.test.ts
sha256: 3ae27bcca026249ee12b4c8cd70c5d6dcee5cff4535cbe51f99033b9b7feaec7
generated_at: 2026-09-27T14:48:08.361357+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/service.test.ts

## Purpose

Integration test suite for the cart service layer (`src/modules/cart/services/`). It exercises the highest-risk seam in the module — the shared `upsertCartItem` behind `set` vs `add` — against a **real MongoDB** (`setupTestDb`), because the guarded `$set` vs `$inc` writes in `cartRepository.upsertLine` cannot be faithfully exercised by a mock. It also pins the CartItem shape contract (no subdocument `_id`), the per-user single-document invariant, the over-serialization guard on the badge view, and the checkout flow's email-dispatch side effect.

## Key elements

- **`setupTestDb()`** — boots a real Mongo instance for the whole file; no repository mocks.
- **`flush()`** — `setImmediate`-based helper that drains the fire-and-forget `sendOrderPlacedEmail` microtask chain before a test asserts on `mockEnqueueEmail`.
- **`mockEnqueueEmail`** — jest mock of `enqueueEmail`; the test asserts *dispatch happened*, not the email body (that is the mailer template suite's job).
- **`renderInvoicePdfMock`** — replaces the PDF-rendering step so Chromium is never launched; the file still exercises the real `orderConfirm` → `sendOrderPlacedEmail` → `enqueueEmail` path.
- **`storedQuantity(userId, productId)`** — reads the persisted quantity straight from `cartRepository.findByUserId` so assertions survive the Mongo round-trip.
- **`giveUserAnAddress(userId)`** — seeds a default address via `addressAdd`, required by checkout rules for `standard`/`express` shipping.
- **`EMPTY_CART`** — the canonical zero-state object every read must return for a cartless user.
- **`describe` blocks** — `cart storage`, `cartGet`, `cartGetForBadge`, `cartItemSetById`, and (truncated) `cartItemAddById`, removal, cleanup (`productRemoveFromCartsById`), and checkout (`orderConfirm`).

## Relationships

- **`src/modules/cart/services/index.ts`** — the unit under test; every exported service function (`cartGet`, `cartGetForBadge`, `cartItemSetById`, `cartItemAddById`, `cartItemRemoveById`, `cartRemove`, `orderConfirm`, `productRemoveFromCartsById`, `cartService`) is imported and exercised here.
- **`src/modules/cart/services/items.ts`** — the `set`/`add` distinction is the primary assertion target; the test explicitly verifies that a second `set` *replaces* (not increments) the stored quantity.
- **`src/modules/cart/repository.ts`** — `cartRepository` is used directly for round-trip assertions (`findByUserId`, `count`) that the service-layer mock would hide.
- **`src/modules/cart/services/checkout.ts`** — `orderConfirm` is the checkout entry point; the test verifies it produces exactly one `enqueueEmail` call and one persisted order.
- **`src/modules/cart/services/cleanup.ts`** — `productRemoveFromCartsById` is tested in the product-deletion / `PRODUCT_DELETED` event path.
- **`src/modules/cart/module.ts`** — imported and registered so the service's DI wiring is real, not hand-stubbed.
- **`src/infrastructure/adapters/mailer.ts`** — mocked at module level; the test asserts on the dispatch call, not the rendered content.
- **`src/infrastructure/adapters/logger.ts`** — imported for log-output assertions (e.g., verifying expected warnings or errors fire during edge cases).
- **`src/infrastructure/i18n/index.ts`** — `t()` is used to compare internationalised error messages returned by the service.
- **`src/kernel/registry.ts`** — `registerModules` wires the real module graph for the test process.
- **`src/kernel/events.ts`** — `resetDomainEvents` / `emitDomainEvent` drive the `PRODUCT_DELETED` event that triggers cart cleanup.
- **`src/modules/addresses/service.ts`** (via `index.ts`) — `addressAdd` seeds the address that checkout requires.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `countOrders`, `findOrder` provide order fixtures and assertions for the checkout flow.

## Notes

- **Real DB, no repo mocks.** The file's own header calls out that a mock cannot exercise the `$set` vs `$inc` guarded write in `upsertLine`. All persistence assertions go through `cartRepository` directly.
- **CartItem shape is a contract.** Multiple tests assert `additionalProperties: false` — a generated Mongo subdocument `_id` would be a serialisation bug. The `cartGetForBadge` test explicitly checks `Object.keys` equals `['productId', 'quantity']`.
- **`flush()` is mandatory before asserting on `mockEnqueueEmail`.** `sendOrderPlacedEmail` is fire-and-forget; without draining the microtask chain, the `enqueueEmail` call has not landed yet and the assertion will see zero calls.
- **`renderInvoicePdf` is mocked to resolve `undefined`** (no attachment), but the real `sendOrderPlacedEmail` body still runs. Do not accidentally remove the mock — Chromium launch would stall the suite.
- **Empty-cart and absent-cart are the same state.** The first test in `cart storage` asserts that no placeholder document is created; `cartGet` for a nonexistent user returns `[]` rather than throwing.
- **Distinct summary numbers are intentional.** The badge-summary test uses 2 lines / 5 units / 80 total so that a mis-wired formula (e.g., `itemsCount` vs `totalQuantity`) is immediately visible.
- **Truncated file.** The visible portion ends mid-`cartItemSetById` block ("defaults the quantity to 1"); the remaining blocks (`cartItemAddById`, removal, `productRemoveFromCartsById`, `orderConfirm`/checkout) are implied by the imports and the module docstring but their full assertions are not shown here.
