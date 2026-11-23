---
source: src/modules/returns/services/withdraw.ts
generated_at: 2026-11-22T07:32:51.557189+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/withdraw.ts

## Purpose
Implements the "withdrawal before dispatch" flow (Art. 11a / Art. 16 right of withdrawal). It cancels and fully refunds an order through `orders`' own cancel, and writes a `Return` that is closed at birth with no lines. That record is the dated proof of the withdrawal, and an acknowledgement mail is sent. Staff can record a withdrawal the buyer stated by phone, email or letter, with the stated date and channel on the record.

## Key elements
- **`withdrawBeforeDispatch(order, input, opener, authContext, context, openAsReturn)`** — the only export. It picks one of three paths:
  1. The shop has started on the order and some items are made-to-order: it calls `withdrawEligibleGroups`.
  2. Staff opener lacking the needed permission: it returns `forbidden(...)`.
  3. Otherwise: it runs `cancelAndRecord`, then `nudgeOutbox()`, `recordOpened(...)`, awaits the cancel's `settle()`, and returns `opened(created)`.
- **`cancelAndRecord`** — a single `withTransaction` that takes the order lock row, calls the order cancel, creates the closed return row, and enqueues `return.requested` and then `return.closed`. If the cancel is refused, nothing is written. The result is `{ canceled }` or `{ created, settle }`.
- **`withdrawalRow`** — builds the closed return: `reason: 'withdrawal'`, empty `lines`, `returnPostage` from `returnPostagePayer()`, `requestedAt` and optional `statedVia` from the opener, and `openedBy` of `'buyer'` or `'staff'`. `decidedAt` and `closedAt` are set to now.
- **`refundOwedOn`** — the full `orderTotal` if `order.paidAt` is set, otherwise a zero decimal padded to the order's currency.
- **`withdrawEligibleGroups`** — for a started order that contains goods excluded from withdrawal. It lists the order's shipment groups, skips any group containing an excluded product, and calls `createCancellation` (`kind: 'cancellation'`) for each remaining group, one after another. It returns the first refusal, the last cancellation written, or `nothingToCancel()`.
- **`missingKeyOf`** — returns the first permission staff lack: `create:Refund`, then `update:Order`. Returns `undefined` if they hold both.

## Relationships
- **`src/modules/orders/index.ts`** — supplies `orderService` (whose `withdrawWithin` is the cancel), `orderTotal`, `hasShopStarted`, `isBeforeDispatch`, `isExcludedFromWithdrawal` and the `OrderDocument` type.
- **`src/modules/delivery/index.ts`** — supplies `deliveryService`, whose `remainderOptions` lists the shipment groups for the partial path.
- **`@infrastructure/runtime/database`** (`src/infrastructure/runtime/database.ts`) — `withTransaction`.
- **`@kernel/outbox`** — `nudgeOutbox`.
- **`@kernel/permissions` and `@kernel/ability`** — `callerForSubject` and `holds`, used for the staff permission check.
- **`@domain-primitives/money`** — `padDecimal`.
- **`@infrastructure/http/response`** — the `ResponseReject` type, used in the transaction's refusal result.
- Sibling modules (not in the neighbor list): `./cancel-remainder` (`createCancellation`), `./ownership` (`openableOrder`, which re-reads the order after a refused cancel), `./outcome` (outcome constructors, outbox enqueue helpers, `recordOpened`, and the `Opener`, `CreateReturnInput`, `CreateReturnOutcome` types), `../repository` (`returnRepository.lockOrder` and `create`) and `@modules/shop` (`returnPostagePayer`).

## Notes
- The cancel and the return write share one transaction, so a crash leaves neither. The only after-commit step is the cancel's `settle()`.
- Race handling: if a shipment lands between the read and the cancel, the cancel is refused. The code then re-reads the order via `openableOrder`. If the order is no longer before dispatch, it calls the supplied `openAsReturn()` to open a return of goods. Otherwise it returns the cancel's refusal.
- The fallback deliberately uses `openableOrder` rather than `ownOrder`, so staff get the same fallback as buyers.
- The refund itself is carried by the cancel's pending-refund marker and the payment sweep, not by this row. The `order-refunded` mail follows when the money settles.
- The made-to-order path leaves the order `processing`, and the made-to-order group is not canceled. The staff permission check is skipped on that path.
- The module header points to a docs anchor, `docs/modules/returns.md#the-withdrawal-button`, which is not part of the listed neighbors.
