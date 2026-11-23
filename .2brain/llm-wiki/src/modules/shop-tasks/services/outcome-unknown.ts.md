---
source: src/modules/shop-tasks/services/outcome-unknown.ts
source_sha256: f31dc75d9fbfd03b65c3eaaa19a928fca484e748dfe14fe4624a47c3de4a585f
context_sha256: 0258f4042a893d1871573689f1ec4cfcbda0ac86793d99a33b8e49fb25466d3e
generated_at: 2026-11-22T07:43:23.912788+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/services/outcome-unknown.ts

## Purpose
Builds the staff notice for a "do-not-retry" write (refund, ship, stock movement) whose outcome is unknown: it started, never reported back, and was not re-run. The idempotency ledger detects the stuck key and calls the sink this module provides. The module names the subject in words (order number or product name) and notifies the staff who do that work, once per stuck key.

## Key elements
- `tellOutcomeUnknown(facts)` (exported): entry point. It validates the operation, resolves the subject's name, and calls `notificationsService.notifyStaff`. It never rejects; all failures are logged via `logger.error`.
- `OPERATIONS`: table mapping each operation to its `OperationTelling`:
  - `refund` → `PaymentRefunding`, `order` page. The order is found via `paymentService.orderIdOf`.
  - `ship` → `DeliveryManagement`, `order` page. The order is found via `deliveryService.orderIdOfFulfillmentOrder`.
  - `receive-stock` and `adjust-stock` → `InventoryManagement`, `inventory` page. The product is found via `productNamed`.
- `OperationTelling` / `NamedSubject`: types for the recipient permission set, the frontend page, the name-resolver, and the resolved `{ subjectId, subjectName }`.
- `orderNamed` / `productNamed`: resolve an order number (`orderService.findManyByIds`) or product title (`productService.findManyByIds`). They return `undefined` if the subject no longer exists.
- `isKnownOperation`: type guard using `Object.hasOwn(OPERATIONS, …)`.

## Relationships
- **`src/infrastructure/http/middlewares/idempotency.ts`**: supplies the `OutcomeUnknownFacts` type. Its ledger calls `tellOutcomeUnknown`. The operation name comes from what routes pass to `requireIdempotencyKey`.
- **`src/modules/orders/index.ts`, `src/modules/payments/index.ts`, `src/modules/delivery/index.ts`, `src/modules/products/index.ts`**: services used to map a key's subject id to an order number or product title.
- **`src/modules/notifications/index.ts`**: `notifyStaff` delivers the notice to the permission sets.
- **`src/modules/shop-tasks/staff-routing.ts`**: provides `SHOP_STAFF_ROUTES`, whose outcome-unknown entry is the notice's route.
- **`src/infrastructure/http/frontend-link.ts`**: `FRONTEND_LINK_RULES` supplies the link template for the `order` or `inventory` page.
- **`src/infrastructure/adapters/logger.ts`**: logs error cases.

## Notes
- The deduplication key is `outcome-unknown:${recordId}`, so each stuck key is notified once.
- An unknown operation, or a subject that no longer exists, is logged as an error and no notice is sent.
- The notice body uses the code `shop-tasks.staff.outcome-unknown`. Its params are `operation`, `subjectId`, `subjectName` and `since` (as an ISO string).
- Not awaiting or failing on the notice is deliberate: the client's 409 must not depend on it.
