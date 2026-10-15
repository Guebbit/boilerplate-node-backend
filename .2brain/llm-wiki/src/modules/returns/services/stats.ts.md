---
source: src/modules/returns/services/stats.ts
sha256: ca601b487ce9ce533be272d681ce03f8c3801414367768aaa139349c4a7c9351
generated_at: 2026-10-15T11:58:47.337931+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/stats.ts

## Purpose

Provides read-only statistical queries about returned goods, aggregated by time bucket, currency, and product. The core convention: a return is attributed to the day its goods were **received** back (i.e. when stock went back on sale and the refund was opened), not when it was initiated.

## Key elements

- **`ReturnedBucket`** (interface) — a single row of currency + bucket-date + unit count.
- **`returnedBuckets(window)`** — total units received back, grouped by currency and time bucket. Returns `ReturnedBucket[]`.
- **`returnedByProduct(window)`** — total units received back, grouped by product (flattened across currencies). Returns `{ productId, units }[]`.
- **`returnedSeries(productId, window)`** — time-bucketed unit counts for a single product. Returns `{ bucket, units }[]`.

All three delegate to `returnRepository.sumReceived`, passing an inline MongoDB aggregation projection and then mapping the raw `_id` groups into plain objects.

## Relationships

- **`@infrastructure/persistence/report`** — supplies `ReportWindow` (half-open range + bucket size) and `bucketOf`, which builds the `$bucket` aggregation expression used in the projections.
- **`@infrastructure/persistence/create-repository`** — supplies `toObjectId`, used by `returnedSeries` to convert a string `productId` to an ObjectId filter argument.
- **`../repository`** — supplies the `returnRepository` singleton whose `sumReceived` method executes the aggregation and applies the time-window filter.
- **`services/index.ts`** — barrel file that re-exports these functions so callers import from the services namespace.
- **`tests/integration/stats.test.ts`** — integration tests exercising the three exported functions against a live repository.

## Notes

- `returnedByProduct` groups by `'$lines.productId'` (an ObjectId in Mongo) but casts it to `String` in the mapper — consumers always receive a hex string, never an ObjectId instance.
- `returnedSeries` is the only function that passes a third argument (the product filter) to `sumReceived`; the other two omit it, implying `sumReceived` treats a missing filter as "no product restriction."
- The aggregation projections are inline object literals, not shared helpers — if the bucket or currency grouping logic changes, all three call sites must be updated in sync.
