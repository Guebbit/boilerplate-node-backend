---
source: src/modules/returns/services/stats.ts
source_sha256: 879eed8cf44ecfd2d1019460de6ddfbf21aa49122b8e55b1d0b959f2623f7103
context_sha256: 0d08f810048981fd4910faa720c688d0a119d5345bf83af62f1145d902649e08
generated_at: 2026-11-22T07:32:30.992347+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/stats.ts

## Purpose
Statistics queries over returned goods. A return counts on the day its goods were received (`receivedAt`), the same moment the stock went back on sale. The file wraps `returnRepository.sumReceived` with three different aggregation shapes and maps the raw rows into plain result objects.

## Key elements
- `ReturnedBucket`: row type `{ currency, bucket: Date, units }`.
- `returnedBuckets(window)`: units received back grouped by currency and time bucket. The window's bucket size sets the grain, via `bucketOf('$receivedAt', window)`.
- `returnedByProduct(window)`: units per product, grouped by `$lines.productId` and summed over every currency and bucket in the window. The id is converted with `String(...)`.
- `returnedSeries(productId, window)`: units of one product per bucket. It passes `toObjectId(productId)` as a third argument to `sumReceived`, so the product filter is applied inside the aggregation.

All three sum `$lines.quantity`.

## Relationships
- `src/modules/returns/repository.ts`: provides `returnRepository`. Each function calls its `sumReceived(window, groupSpec, productId?)` method. This file supplies the `$group` spec and reshapes the rows.
- `src/infrastructure/persistence/report.ts`: provides `ReportWindow` (a half-open window plus bucket size) and `bucketOf`, which builds the bucket expression.
- `src/infrastructure/persistence/create-repository.ts`: provides `toObjectId`, used to convert the product id in `returnedSeries`.
- `src/modules/returns/services/index.ts`: a neighbor in the graph, presumably the services entry point that exposes these functions.
- `src/modules/returns/tests/integration/stats.test.ts`: the integration test for these stats.

## Notes
- Windows are half-open.
- `returnedByProduct` ignores bucket size, while `returnedBuckets` and `returnedSeries` use it.
- Only `returnedSeries` filters by product. The other two aggregate across all products, with `returnedByProduct` grouping by product.
