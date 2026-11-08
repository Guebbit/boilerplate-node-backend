---
source: src/modules/returns/services/index.ts
sha256: 158836318f0bca4f085e396f8590789969bf68b3dafd408efcb6afbbc7ec20fa
generated_at: 2026-11-08T08:03:55.881457+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/index.ts

## Purpose

Aggregate entry point for the returns domain. It re-imports every operation a controller might need (creating, deciding, receiving, closing, cancelling, listing, reading, notifying, stats, retention scrubbing, personal-data collection, digest) and bundles them into a single `returnService` object, so callers only depend on this one file rather than twelve siblings.

## Key elements

- **`returnService`** – the sole named export (a const object). Exposes 18 methods covering the full return lifecycle plus read/query helpers, notification emails, analytics buckets, retention scrubbing, personal-data collection, and the digest.
- **Type re-exports** – `CreateReturnInput`, `CreateReturnOutcome`, `ReceiveReturnInput`, `ReturnFilters`, `ReturnedBucket` are surfaced for consumers who need the shapes without importing the leaf modules directly.

## Relationships

- **Controllers** (`get-return-options`, `get-return`, `get-returns`, `post-return`, `post-return-decision`, `post-return-receive`, `post-return-close`, `post-return-cancel`) import `returnService` from this file to call the relevant method; they never reach into the leaf service modules directly.
- **`src/modules/returns/module.ts` / `index.ts`** wire the module; this file is the service-layer surface they expose to the rest of the app.
- **Leaf services** (`create.ts`, `decide.ts`, `receive.ts`, `close.ts`, `cancel.ts`, `personal-data.ts`, `read.ts`, `options.ts`, `retention.ts`, `notify.ts`, `stats.ts`, `digest.ts`) are the implementation modules whose named exports are pulled in and re-exposed through `returnService`.

## Notes

- `withActions` (from `./read`) is exposed on `returnService` alongside the plain `getReturn`/`listReturns` reads; it presumably decorates a return record with the actions available to the caller, but its exact contract lives in `read.ts`.
- The doc comment describes "one file each" for each concern, reinforcing that this index is intentionally a flat re-export with no logic of its own.
- `scrubReturnText` (retention) and `collectPersonalData` are privacy/GDPR helpers co-located here for convenience; they are not part of the core return lifecycle.
