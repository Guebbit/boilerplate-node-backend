---
source: src/modules/returns/services/ownership.ts
source_sha256: bf56e3e0c2a0ff0632b7972fa6e55a578562c20623b47d0f642199797482231c
context_sha256: 83fccb6e6da00a97dc4d526ad897715f3b9b2ab301f82d232edbd6cd7f5990ec
generated_at: 2026-11-22T07:30:50.287929+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/ownership.ts

## Purpose
Answers who may open a return on an order, from the `returns` module's point of view. It is the single question that `createReturn` and `getReturn` both ask before touching a return. It separates being the buyer from acting on the buyer's behalf as staff.

## Key elements
- **`OpenableOrder`** (interface): `{ order: OrderDocument; byStaff: boolean }`. `byStaff` is `true` when the caller is not the buyer but holds `update:Return` and acts for the buyer.
- **`ownOrder(orderId, authContext)`**: fetches the order with `orderService.getForCaller` and returns it only if `isBuyer(order, authContext)` is true. Otherwise it returns `undefined`. This checks ownership, not just visibility, so an operator who can read any order is not treated as its buyer.
- **`openableOrder(orderId, authContext)`**: tries `ownOrder` first and returns `{ order, byStaff: false }` on a match. If that fails and the caller holds `update` on `Return`, it loads the order with `orderService.getById` and returns `{ order, byStaff: true }`. Otherwise it returns `undefined`.

## Relationships
- **`@modules/orders`** (`index.ts`): provides `orderService` (`getForCaller`, `getById`), the `isBuyer` check, and the `OrderDocument` type.
- **`@kernel/permissions`**: `callerForSubject(authContext, 'Return')` builds the caller used for the permission check.
- **`@kernel/ability`**: `holds(caller, 'update', 'Return')` performs the check.
- **`@types`**: supplies `AuthContext`.
- **Consumers**: `createReturn` and `getReturn` (per the module doc) call into this file, so `create.ts` and `read.ts` are the expected callers.

## Notes
- `undefined` is how the door says "not found". The doc comment says it is answered as a 404, so a caller who can't open the order can't tell whether it exists.
- A staff member buying for themselves is treated as a buyer first (`byStaff: false`), because `ownOrder` runs before the staff check.
- Only the `update:Return` permission opens the staff path. Having read access to orders is not enough.
