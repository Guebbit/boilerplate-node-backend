---
source: src/modules/orders/jobs.ts
source_sha256: a95010cef7187c90a96415a5e2d7176abcf068f29b6e82684bb4a43d8a92d791
context_sha256: 22d50ca203fe64f364c516d1a9b67e753a401b1f6b3caa2cc4d6390a1d1549a6
generated_at: 2026-11-22T06:15:10.001016+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/jobs.ts

## Purpose
Declares the scheduled jobs owned by the `orders` module. Currently that is a single job: the retention scrub, which anonymizes due orders and then scrubs timeline text. The file's header comment points to the scheduled-jobs section of the ops reference docs.

## Key elements
- `ordersJobs` (exported, `readonly JobDeclaration[]`): the module's job list, containing one entry.
  - The entry spreads generated job data (`ordersJobData.reapOrders`) and adds a `run` function.
  - `run` calls `anonymizeDueOrders()`, then `scrubTimelineText()`, and resolves to the count returned by `anonymizeDueOrders()`. A code comment says the demo profile's job lever reports this count.

## Relationships
- `src/kernel/registry.ts`: provides the `JobDeclaration` type (type-only import) that `ordersJobs` entries must satisfy.
- `src/modules/orders/services/retention.ts`: provides `anonymizeDueOrders`, the first step of `run`.
- `src/modules/orders/services/timeline.ts`: provides `scrubTimelineText`, run after anonymization.
- `src/modules/orders/module.ts`: a graph neighbor, but this file does not import it or reference it.

## Notes
- The two steps run sequentially. `scrubTimelineText()` runs only after `anonymizeDueOrders()` resolves, and its result is discarded.
- Only the job's metadata comes from generated data. The `run` implementation is hand-written here.
