---
source: src/modules/delivery/services/release-date-impact.ts
sha256: 1d7cb2fdb5c065316956bb2a58cc66ed1738233806e756c0261890e68c17bb6a
generated_at: 2026-11-08T05:39:01.908782+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/release-date-impact.ts

## Purpose

Provides a **read-only staff preview** of how changing a product's release date (preorder) or restock date (backorder) would affect waiting orders. It runs the same judgment logic (`judgeMove`, `expectedDateOfWaiting`) that the actual save listener uses, so the preview count cannot drift from the real outcome. No writes are performed.

## Key elements

- **`previewDateImpact(productId, cause, date)`** — the sole public export. Resolves a product, short-circuits to `{ notify: 0 }` if the date is unchanged, otherwise loads all waiting fulfillment orders for that product, judges each against the hypothetical new date, and returns a `ReleaseDateImpact` count. Returns a 404 `ResponseReject` for unknown products.
- **`verdictsFor(waiting, productId, date, cause)`** — internal. Batch-fetches *other* products referenced in the fulfillment order lines (via `productService.findManyByIds`) so `judgeMove` can compare against their dates, then returns one `Judged` entry per fulfillment order that produced a verdict.
- **`tally(judged)`** — internal. Deduplicates by `orderId` and counts only entries whose verdict kind is `'notify'`. This is why the count is **orders**, not fulfillment orders.
- **`dateFor(product, cause)`** / **`sameDate(a, b)`** — small helpers: pick the correct date field based on wait cause, and compare two optional `Date` values by `getTime()`.
- **`NOBODY`** — frozen constant `{ notify: 0 }` returned when no change is detected.

## Relationships

- **`../domain` (fulfillment, preorder)** — imports `judgeMove`, `expectedDateOfWaiting`, `SlipVerdict`, `WaitCause`. These are the exact functions the post-save listener uses, guaranteeing preview fidelity.
- **`../repository`** — `fulfillmentOrderRepository.findWaitingForProduct(productId, cause)` supplies the set of orders still waiting.
- **`@modules/products`** — `productService.findByIdRaw` resolves the target product; `productService.findManyByIds` resolves sibling products needed for multi-product fulfillment order lines.
- **`@modules/shop`** — `shopTimezone()` is passed into `judgeMove` so date comparisons are timezone-correct.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape the HTTP-level result.
- **`@infrastructure/i18n`** — `t('products.not-found')` localises the 404 message.
- **`@types`** — imports the `ReleaseDateImpact` shape returned to the caller.
- **`../services/index`** — this file is re-exported from the services barrel for external consumers.
- **`../tests/unit/reship.test.ts`** — exercises the preview alongside reship logic.

## Notes

- The preview is intentionally a **snapshot**: a payment or shipment landing between preview and save will shift the real count. The doc comment calls this out explicitly.
- `date` being `undefined` means "clear the date," not "keep it." The `sameDate` check treats both-`undefined` as no-change.
- `verdictsFor` filters out fulfillment orders that produced no verdict (i.e., `judgeMove` returned `undefined`), so only orders actually affected are tallied.
- The `NOBODY` constant is marked `as const`; the 404 path and the no-change path both return a fresh spread of it rather than a shared mutable reference.
