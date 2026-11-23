---
source: src/modules/delivery/services/release-date-impact.ts
source_sha256: ae243a073b3ac2c3b588587df571e7d75eb2833b5b0da291835e767f8eb4dde2
context_sha256: 0ecc057f619f2223be6d1141cdf8f4efa2d0eac6332ad9e2faab198492fc8ceb
generated_at: 2026-11-22T04:58:14.570006+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/release-date-impact.ts

## Purpose
Powers the staff preview of a release-date (preorder) or restock-date (backorder) change. Before the date is saved, it counts how many already-paid orders would be emailed. It reuses the event listener's own rule (`judgeMove`, `expectedDateOf*`) and writes nothing, so the preview matches what saving would do.

## Key elements
- `previewDateImpact(productId, cause, date)` — the only export. Returns `ResponseSuccess<ReleaseDateImpact>` or a 404 reject (`products.not-found`) if the product doesn't exist. A `date` of `undefined` means the date is being cleared.
- `verdictsFor` — takes the waiting fulfillment orders and judges each with `judgeMove` against the hypothetical date. It loads the other products on those orders via `productService.findManyByIds`. For the product being previewed it uses the new date. For the others it uses their current date, chosen by `dateFor`. Orders with no verdict are dropped.
- `tally` — counts distinct `orderId`s whose verdict kind is `'notify'`, returning `{ notify: n }`.
- `dateFor` — picks `restockDate` for `'backorder'`, otherwise `releaseDate`.
- `sameDate` — compares two optional dates by timestamp.
- `NOBODY` — the `{ notify: 0 }` constant returned when nothing changes.

## Relationships
- `../domain` — supplies `judgeMove`, `expectedDateOfWaiting` and the types `SlipVerdict` and `WaitCause`.
- `../repository` — loads the waiting fulfillment orders for the product and cause.
- `../model` — `FulfillmentOrderDocument` type.
- `@modules/products` — `productService` is used to look up the previewed product and the other products on the waiting orders.
- `@modules/shop` — `shopTimezone()` is passed to `judgeMove`.
- `@infrastructure/http/response` — `generateSuccess` and `generateReject`.
- `@infrastructure/i18n` — `t()` for the 404 message.
- `@types` — `ReleaseDateImpact` type.

## Notes
- The count is of orders, not fulfillment orders. An order with several notified groups counts once.
- The result is a snapshot. A payment or shipment between preview and save can change the real outcome.
- If the new date equals the product's current date, it returns `{ notify: 0 }` without querying fulfillment orders. This mirrors saving an unchanged date, which emits nothing.
- Only `notify` verdicts are counted. Other verdict kinds are ignored.
