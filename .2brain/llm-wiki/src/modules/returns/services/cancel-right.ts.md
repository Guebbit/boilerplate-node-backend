---
source: src/modules/returns/services/cancel-right.ts
source_sha256: 15481e7f517aad2062b701086d2b452a4cf3c5634a6307b00245dbd2d4b28b99
context_sha256: f93afcbaa73fa2f627ff22ffacec36f25557de14940fd4361c2e80b9d7275908
generated_at: 2026-11-22T07:28:00.110852+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/cancel-right.ts

## Purpose
Single rule for "who may cancel a remainder" (the not-yet-shipped part of a fulfillment order). It is shared by the two askers, the door that refuses (`cancel-remainder.ts`) and the options read that offers (`options.ts`), so the UI cannot offer a cancellation that the backend then rejects.

## Key elements
- `CancelRefusal` — union type `'window-closed' | 'excluded' | 'no-key'`: the buyer's two limits, or staff lacking the refund key.
- `cancelRefusalOf(order, authContext, remainder, statedAt?)` — returns the first refusal reason for this caller, or `undefined` if they may cancel.
  - `statedAt` is set when staff record a withdrawal the buyer stated outside the shop. It is absent for the buyer (judged at "now") and for staff cancelling for their own reasons (no withdrawal to judge).

## Rule logic (in order)
1. Not the buyer and no `create:Refund` ability → `'no-key'`.
2. Not the buyer and no `statedAt` → `undefined` (staff cancelling on their own; no further limits).
3. Judge at `statedAt ?? new Date()`. If `order.withdrawUntil` is set and that moment is past `withdrawalClosesAt(order.withdrawUntil)` → `'window-closed'`.
4. If the shop has not started the order (`hasShopStarted(order.status)` is false) → `undefined`.
5. Otherwise, if any remainder product belongs to an item with `isExcludedFromWithdrawal` (Art. 16, made to order) → `'excluded'`; else `undefined`.

## Relationships
- `@kernel/permissions` (`callerForSubject`) and `@kernel/ability` (`holds`) — check the `create` / `Refund` key for non-buyers.
- `@modules/orders` (index; types from `model.ts`, helpers from the domain files) — supplies `isBuyer`, `hasShopStarted`, `isExcludedFromWithdrawal`, `withdrawalClosesAt` and the `OrderDocument` type.
- `@types` — `AuthContext` for the caller.
- `../domain` — `ProductQuantity` type for the remainder lines.
- `cancel-remainder.ts` and `options.ts` — the two consumers of `cancelRefusalOf`.

## Notes
- The order's buyer is judged by the withdrawal rules even if they are also staff, because the buyer check comes first.
- Excluded goods can be cancelled only while the order is `paid`. Once it is `processing`, that group is the shop's work and stays.
- Excluded products are matched by `String(item.product._id)` against the remainder's `productId`.
- The function is pure apart from reading the current time when `statedAt` is absent.
