---
source: src/modules/delivery/services/release-date-impact.ts
sha256: e1071aa3464fad3d0293aa4a8563b4a7926c4e95bd26bb26002f4fbe2d849d71
generated_at: 2026-10-29T03:43:11.424406+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/release-date-impact.ts

## Purpose

Read-only dry-run that tells a staff member how many orders would receive an email if a product's release date (preorder) or restock date (backorder) were set to a given value. It reuses the exact same judgment logic as the save path so the preview can never drift from what actually happens on save.

## Key elements

- **`previewDateImpact(productId, cause, date)`** — the sole export. Resolves to `ResponseSuccess<ReleaseDateImpact>` (a `{ notify: number }` count) or a 404 `ResponseReject`. Short-circuits to zero if the date is unchanged.
- **`verdictsFor(waiting, productId, date, cause)`** — for each waiting fulfillment order, calls `judgeMove` / `expectedDateOfWaiting` with a `dateOf` resolver that substitutes the hypothetical date for the target product and the stored date for sibling products. Returns one `Judged` entry per fulfillment order whose verdict is non-null.
- **`tally(judged)`** — collapses the per-fulfillment-order verdicts into a distinct-order count of those whose `verdict.kind === 'notify'`.
- **`dateFor(product, cause)`** — picks `releaseDate` or `restockDate` based on the `WaitCause`.
- **`sameDate(a, b)`** — `getTime()` comparison of two optional dates.
- **`Judged`** (interface) — `{ orderId: string; verdict: SlipVerdict }`, the per-fulfillment-order result.
- **`NOBODY`** — `{ notify: 0 }` constant returned when nothing changes.

## Relationships

- **`../domain`** (`judgeMove`, `expectedDateOfWaiting`, `SlipVerdict`, `WaitCause`) — the core judgment rules; this file delegates all "would this order be told?" decisions to the domain layer.
- **`../repository`** (`fulfillmentOrderRepository.findWaitingForProduct`) — fetches the set of fulfillment orders still waiting on the target product.
- **`../model`** (`FulfillmentOrderDocument`) — the document shape passed into `verdictsFor`.
- **`@modules/products`** (`productService.findByIdRaw`, `findManyByIds`) — resolves the target product (for the 404 check and same-date short-circuit) and sibling products (for their existing dates in the judgment).
- **`@infrastructure/http/response`** — wraps results in `generateSuccess` / `generateReject`.
- **`@infrastructure/i18n`** — translates the 404 error string.
- **`@types`** (`ReleaseDateImpact`) — the public shape of the count payload.
- **`src/modules/delivery/services/index.ts`** — re-exports `previewDateImpact` so callers import from the services barrel.

## Notes

- The count is **distinct orders**, not fulfillment orders. An order with several waiting groups that would all be notified still counts as one.
- The result is a **snapshot**. A payment or shipment arriving between preview and save can change the real count.
- Saving a date identical to the one already on the product returns `{ notify: 0 }` immediately without touching the repository.
- `dateOf` inside `verdictsFor` resolves sibling products by comparing `String(product._id)` to the line's `productId`; the target product's line is handled by the `id === productId` branch that returns the hypothetical `date`.
