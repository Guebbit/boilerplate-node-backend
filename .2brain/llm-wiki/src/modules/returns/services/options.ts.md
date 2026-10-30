---
source: src/modules/returns/services/options.ts
sha256: 3c43e80df2b299100296329c469a70a56017b65b1ee467a79a53cb30b1879369
generated_at: 2026-10-29T05:43:35.144490+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/options.ts

## Purpose

Computes the full set of return and cancellation options for a single order in one pass: which shipped goods the caller may still return (and under which reasons), and which fulfillment-order remainders they may still cancel (with the exact refund owed). Centralising this derivation here means no client re-computes quantities, deadlines, or refund amounts independently.

## Key elements

- **`getReturnOptions(orderId, authContext)`** *(export)* — Main entry point. Resolves the order, then in parallel fetches existing returns, shipped quantities, and remainder options; assembles a `ResponseSuccess<ReturnOptions>` or a 404 `ResponseReject`.
- **`readableOrder(orderId, authContext)`** — Guards access: staff holding `read:Return` may read any order; everyone else is restricted to their own order via `ownOrder`.
- **`offeredReasons(order, authContext, now)`** — Returns which `ReturnReason`s the caller may name (buyer: only open deadlines; staff with `update:Return`: all reasons, with past-deadline non-withdrawal reasons listed as `exceptions`).
- **`optionLines(order, quantities, excluded)`** — Maps a product-quantity map into display lines with frozen product titles and a `withdrawable` flag per line.
- **`OfferedReasons`** *(interface)* — Carries `reasons`, `exceptions` (staff-only preview of waived deadlines), and a `staff` boolean.

## Relationships

- **`@infrastructure/http/response`** — Wraps results in `generateSuccess` / `generateReject` and types the return as `ResponseSuccess<ReturnOptions> | ResponseReject`.
- **`@infrastructure/i18n`** — Translates the 404 error message via `t('returns.order-not-found')`.
- **`@kernel/ability` / `@kernel/permissions`** — `holds` + `callerForSubject` perform the `read:Return` and `update:Return` permission checks that gate visibility and reason access.
- **`@modules/delivery`** — `deliveryService.shippedQuantities` supplies what has shipped; `deliveryService.remainderOptions` supplies cancellable remainder lines (and whether delivery refund applies).
- **`@modules/orders`** — `orderService.getById` loads the order; `isBuyer` identifies the buyer; `isExcludedFromWithdrawal` marks Art. 16 goods; `OrderDocument` is the shared order shape.
- **`../domain`** (returns domain barrel) — Provides the pure computation helpers: `returnableQuantities`, `wireLines`, `holdsReturnedGoods`, `isReasonOpen`, `reasonsOpenAt`, `isGuaranteeReason`, and the `ProductQuantity` type.
- **`./cancellation-refund`** — `cancellationRefundOn` computes the exact refund (total + shipping) for a given remainder.
- **`./deadlines`** — `frozenDeadlinesOf` extracts the per-reason deadlines frozen on the order at creation time.
- **`./cancel-right`** — `cancelRefusalOf` mirrors the write-path refusal rule so the UI's `cancel` flag never advertises a cancellation that would be rejected.
- **`./ownership`** — `ownOrder` restricts non-staff callers to their own order.

## Notes

- `returnable` is force-emptied when no reason deadline is open for the caller, so the client can treat an empty array as "no return form to show."
- Art. 16 excluded goods (`isExcludedFromWithdrawal`) are hidden from `returnable` **unless** the caller is staff or an open guarantee (non-withdrawal) reason applies; this is the `excludedOffered` guard.
- The `cancel` boolean on each `cancellable` entry is computed with the *same* rule the mutation path uses (`cancelRefusalOf`), guaranteeing the button and the write agree.
- `shippingRefund` on a cancellable line is non-zero only when that remainder is the last unit of its fulfillment order — the delivery cost is refunded with it.
