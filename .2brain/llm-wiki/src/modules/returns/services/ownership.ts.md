---
source: src/modules/returns/services/ownership.ts
sha256: 94771ce51774f5d70002bab3f282bc0a9db4c71cd144e136a60ce0480ff0af68
generated_at: 2026-10-15T11:57:28.348226+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/ownership.ts

## Purpose

Single-purpose guard that answers one question for the returns module: *does the caller own this order?* Both `createReturn` and `getReturn` call this before proceeding, because being able to *see* an order (operator visibility) is not the same as having the buyer's right to act on it (ownership).

## Key elements

- **`ownOrder(orderId: string, authContext: AuthContext): Promise<OrderDocument | undefined>`** — The sole export. Delegates to `orderService.getForCaller` to fetch the order for the given caller, then additionally verifies that `order.userId` equals `authContext.id`. Returns the `OrderDocument` only when both conditions hold; otherwise `undefined`. Callers treat `undefined` as "no ownership" and must short-circuit.

## Relationships

- **`@modules/orders` (index / services)** — Imports `orderService` and the `OrderDocument` type. All data access to the order record is delegated here; this file never touches a data store directly.
- **`@types/auth-context`** — Imports the `AuthContext` type, which supplies the caller identity (`authContext.id`) used in the ownership comparison.
- **`src/modules/returns/services/create.ts`** — Consumes `ownOrder` as a pre-check before creating a return.
- **`src/modules/returns/services/read.ts`** — Consumes `ownOrder` as a pre-check before reading/returning return data (`getReturn`).

## Notes

- The function deliberately checks *ownership* (`userId === authContext.id`), not merely *visibility*. An operator with broad read access via `getForCaller` will still receive `undefined` from `ownOrder` if they are not the buyer.
- The comparison uses `String(order.userId)` to guard against a type mismatch (e.g., numeric vs. string ID fields on the order document).
- Callers should branch on `undefined` (falsy) rather than expecting an error/throw; the function never rejects for a non-owner.
