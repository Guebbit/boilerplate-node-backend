---
source: src/modules/returns/services/stats.ts
sha256: ca601b487ce9ce533be272d681ce03f8c3801414367768aaa139349c4a7c9351
generated_at: 2026-11-08T08:06:24.774961+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/stats.ts

## Purpose

Aggregation queries that report how many units were received back (returned) within a time window, broken down by currency-bucket, by product, or by bucket for a single product. All three functions delegate to the `sumReceived` repository method with a different MongoDB group-by pipeline.

## Key elements

- **`ReturnedBucket`** — interface for one row of `returnedBuckets`: `{ currency, bucket, units }`.
- **`returnedBuckets(window)`** — groups by currency and time bucket (via `bucketOf`), sums `lines.quantity`. Returns `ReturnedBucket[]`.
- **`returnedByProduct(window)`** — groups by `lines.productId`, sums `lines.quantity`. Returns `{ productId, units }[]` (productId is cast to `string`).
- **`returnedSeries(productId, window)`** — groups by time bucket only, filtered to one product (passed as `toObjectId(productId)`). Returns `{ bucket, units }[]`.

## Relationships

- **`@infrastructure/persistence/report`** — supplies the `ReportWindow` type and the `bucketOf` aggregation helper used to bucket `$receivedAt` per the window's granularity.
- **`@infrastructure/persistence/create-repository`** — supplies `toObjectId`, used in `returnedSeries` to coerce the product id for the filter.
- **`../repository`** — provides `returnRepository`, whose `sumReceived` method executes the actual MongoDB aggregation; each function in this file passes a different `group` stage and (optionally) a filter id.
- **`../services/index.ts`** — barrel file that re-exports these functions so consumers import from the module root.
- **`../tests/integration/stats.test.ts`** — integration tests exercising all three exported functions against a live/seeded database.

## Notes

- The module doc comment clarifies the business rule: a return is counted on the day its goods were **received back** (`$receivedAt`), not on the day the customer initiated it.
- `sumReceived` is called with a typed generic for the row shape; the `_id` field is always unpacked manually in the `.then` mapper — there is no generic that flattens it automatically.
- In `returnedByProduct`, `_id` is typed as `unknown` in the generic and then `String(row._id)` is used to satisfy the public `productId: string` contract (the DB value may be an ObjectId or a plain string depending on how the product was stored).
