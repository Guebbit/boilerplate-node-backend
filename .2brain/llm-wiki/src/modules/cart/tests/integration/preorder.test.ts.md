---
source: src/modules/cart/tests/integration/preorder.test.ts
sha256: 7dc51af7958b472b10f223c68eb4a9f3dd865b97ae19607b539dd36bdfb5a2a8
generated_at: 2026-10-29T03:28:57.381063+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/preorder.test.ts

## Purpose

Integration tests that verify the cart's preorder lifecycle: how a preorder line is read (availability states), how checkout claims backorder allowance while leaving on-shelf stock untouched, how the frozen promise survives a later release-date change, and how a basket mixing preorder and in-stock items is accepted atomically.

## Key elements

- **`nextMonth()`** — returns an ISO date 30 days out; used as the catalogue release-date value.
- **`preorderProduct(limit, onHand = 0)`** — creates a product with a future `releaseDate` and sets its backorder limit via `inventoryService.setBackorderLimit`. Default `onHand` is 0 to isolate the allowance path.
- **`availabilityOf(userId)`** — convenience: reads `items[0].availability` from `cartService.getForView`.
- **`shopperWith(productId, quantity, email?)`** — provisions a user + address + cart line + `'pickup'` shipping; returns a user ready for `orderConfirm`.
- **`describe('a preorder line')`** — four cases covering the availability enum: `preorder`, `insufficient_stock`, `out_of_stock` (zero allowance), and `in_stock` after the release date passes.
- **`describe('checking out a preorder')`** — four cases covering `orderConfirm`: allowance claim + frozen line, 409 rejection when allowance is exhausted, mixed-basket acceptance, and promise persistence after date change.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/setup-test-db.ts` | Calls `setupTestDb()` at module top to provision a real database. |
| `tests/support/callers.ts` | Supplies `testCallerContext` passed to every service call. |
| `tests/support/checkout-modules.ts` | `registerCheckoutModules([paymentsModule])` wires the checkout pipeline in `beforeEach`. |
| `src/kernel/events.ts` | `resetDomainEvents()` clears the event bus between tests so assertions aren't polluted. |
| `src/modules/users/tests/factories.ts` | `createUser` builds the actor under test. |
| `src/modules/addresses/tests/factories.ts` | `giveAddress` satisfies the address prerequisite for checkout. |
| `src/modules/products/tests/factories.ts` | `createProduct` seeds catalogue items (both preorder and in-stock). |
| `src/modules/products/index.ts` | `productService.updateById` mutates `releaseDate` to simulate time passing. |
| `src/modules/inventory/index.ts` | `inventoryService` is the system-under-test's collaborator: `setBackorderLimit`, `listPreorders`, `availableFor`. |
| `src/modules/cart/services/index.ts` | `cartService` is the primary service under test (`addItemById`, `getForView`, `orderConfirm`). |
| `src/modules/cart/repository.ts` | `cartRepository.setShippingMethod` sets `'pickup'` so checkout preconditions are met. |
| `src/modules/payments/module.ts` | Registered as a checkout module; not directly asserted on in these tests. |

## Notes

- Tests run against a **real database** (`setupTestDb`), not in-memory mocks—treat failures as environment-sensitive (stale data, timing).
- `beforeEach` resets domain events *and* re-registers checkout modules; adding a new checkout module to the app without updating this file will silently leave it unregistered here.
- The "promise frozen" assertion reads the result object captured **before** the date is changed; it does not re-fetch the order, so it verifies the snapshot at confirm-time rather than a later state.
- `preorderProduct` defaults `onHand` to 0 intentionally: every test in the availability block isolates the allowance axis. The one exception (`out_of_stock` test) passes `onHand = 50` to prove shelf stock is irrelevant when allowance is zero.
