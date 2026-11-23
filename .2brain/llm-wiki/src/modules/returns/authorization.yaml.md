---
source: src/modules/returns/authorization.yaml
source_sha256: 76524d4a95d58d00f8c4d9704cdec9f2ddb61126f056c63e5557046cb71a55eb
context_sha256: ec7ebc28619aaae9b938bb6880767d8dea1b9ee743779a3e99363203f88125a2
generated_at: 2026-11-22T07:20:57.341343+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/authorization.yaml

## Purpose
Declares the permission rules and rule sets for the `returns` module. It defines who may read, decide, and receive `Return` records, all at tenant (shop-wide) scope, and bundles those rules into named sets that can be granted to roles.

## Key elements
- **Rules** (all `subject: Return`, `module: returns`, `scope: tenant`):
  - `read:Return` – read every return in the shop (the staff queue).
  - `update:Return` – approve or decline a return request (with a reason), cancel an approved return whose goods never came, and open a return or record a withdrawal on a buyer's behalf.
  - `receive:Return` – record that returned goods arrived (restocks units and refunds the customer), or record the buyer's proof of sending (on a withdrawal this opens the refund first). Marked `stepUp: critical`.
- **Sets**:
  - `ReturnDisplay` → `read:Return`
  - `ReturnManagement` → `update:Return`
  - `ReturnReceiving` → `receive:Return`

## Relationships
- `src/modules/payments/authorization.yaml`: the file's comments tie `receive:Return` to `create:Refund` (same `critical` step-up tier), since receiving pays the customer back. Refund rules themselves are defined in the payments module, not here.
- `src/modules/returns/openapi.yaml` and `src/modules/returns/asyncapi.webhooks.yaml`: sibling API and webhook specs for the same module. Nothing in this file references them directly.

## Notes
- There is deliberately no own-rows rule on `Return`. A customer making or reading their own return only needs to be signed in, as with an order's own cancel. Ownership is decided via the order, because a return is keyed by `orderId`, not `userId`. Erasing an account therefore leaves the return without a personal link.
- `receive:Return` is intentionally narrower than `update:Return` (compare `start:Shipment` vs `update:Order`). The warehouse can confirm a parcel arrived without being given the decision on whether the return was owed.
- `stepUp: critical` on `receive` is there because a stolen access token proves nothing about how recently its holder entered their password.
