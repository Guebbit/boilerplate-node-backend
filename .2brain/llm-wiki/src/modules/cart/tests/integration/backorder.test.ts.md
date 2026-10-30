---
source: src/modules/cart/tests/integration/backorder.test.ts
sha256: 99aa8c240c4f14c4ab1589f0327d66082778b5854a60614fee05887b2e6548a7
generated_at: 2026-10-29T03:26:50.948570+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/backorder.test.ts

## Purpose

Integration tests covering the backorder lifecycle as seen by the cart: the four availability states a single cart line can report, and the checkout behavior when shelf stock is insufficient (how many units are frozen as owed, what promise date is recorded, and what happens when the request exceeds both shelf and backorder cap).

## Key elements

- **`backorderProduct(onHand, limit, restockInDays?)`** – Creates a product with `allowBackorder: true`, optional `restockDate`, and synchronises the inventory backorder limit via `inventoryService.setBackorderLimit`. Returns the product document.
- **`availabilityOf(userId)`** – Reads the `availability` field of the first line in the user's cart view.
- **`shopperWith(productId, quantity)`** – Builds a fully check-out-ready user: creates the user, attaches a shipping address, adds the product to the cart, and sets shipping method to `'pickup'`.
- **`describe('a backorder line')`** – Four tests asserting availability is `in_stock`, `backorder`, `insufficient_stock`, or `out_of_stock` depending on the relationship between quantity, `onHand`, and the backorder cap.
- **`describe('checking out a backorder')`** – Four tests asserting: partial fill freezes `backorderedQuantity` and `promisedAt`; a missing restock date defaults the promise to ~30 days with `promiseDated: false`; a fully-covered line leaves both fields `undefined`; and an over-cap request returns `409` with inventory levels unchanged.

## Relationships

- **`src/modules/cart/services/index.ts`** – `cartService` is the system under test (`addItemById`, `getForView`, `orderConfirm`).
- **`src/modules/cart/repository.ts`** – `cartRepository.setShippingMethod` used to set pickup in `shopperWith`.
- **`src/modules/inventory/index.ts`** – `inventoryService.setBackorderLimit` (test setup) and `inventoryService.listLevels` (post-assertion of reserved/available/backordered counts).
- **`src/modules/payments/module.ts`** – `paymentsModule` registered as a checkout module so `orderConfirm` can complete.
- **`src/kernel/events.ts`** – `resetDomainEvents()` in `beforeEach` isolates the event bus between tests.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the test database.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules` wires the payments module into the checkout pipeline.
- **`tests/support/callers.ts`** – `testCallerContext` supplied to service calls.
- **`src/modules/users/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`**, **`src/modules/addresses/tests/factories.ts`** – domain-entity factories for user, product, and address.

## Notes

- `backorderProduct` writes the cap in **two** places (product doc `restockDate` is optional; the numeric cap goes through `inventoryService.setBackorderLimit`). The two are independent and must be set consistently for each test.
- When no restock date is configured, the system promises ~30 days from *order time* and sets `promiseDated: false`. When a restock date **is** set, `promiseDated: true` and the date matches the product's `restockDate` exactly.
- A fully in-stock line leaves `backorderedQuantity` and `promisedAt` as `undefined` (not `0` / `null`).
- The 409 refusal test asserts inventory is untouched (`reserved: 0`, `available: 1`, `backordered: 0`), i.e. the rejection is atomic — no partial reservation survives.
