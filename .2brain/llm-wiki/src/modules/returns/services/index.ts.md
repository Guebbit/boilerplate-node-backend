---
source: src/modules/returns/services/index.ts
sha256: 5a262eda9c4c24537335c948f4cbb588f3f33c10763df8542d1620d8b3b194b8
generated_at: 2026-11-14T21:39:02.333010+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/index.ts

## Purpose

Barrel/facade for the returns domain. It pulls in every operation a controller might need (create, decide, receive, cancel, close, notify, stats, retention, export) from its sibling modules and bundles them into a single `returnService` object, giving callers one import point instead of a dozen file paths.

## Key elements

- **`returnService`** — the sole value export. A plain object exposing 19 methods:
  - *Lifecycle:* `createReturn`, `approveReturn`, `declineReturn`, `receiveReturn`, `closeReturnByHand`, `cancelReturn`
  - *Read / filtering:* `listReturns`, `getReturn`, `getReturnOptions`, `withActions`
  - *Proof / evidence:* `recordProofOfSending`
  - *Retention & data:* `scrubReturnText`, `collectPersonalData`
  - *Outbound mail:* `mailReturnRequested`, `mailReturnDecided`, `mailReturnClosed`
  - *Analytics / export:* `returnedBuckets`, `returnedByProduct`, `returnedSeries`, `returnsDigest`
- **Re-exported types** (no runtime cost): `CreateReturnInput`, `CreateReturnOutcome`, `ReceiveReturnInput`, `ReturnFilters`, `ReturnedBucket`

## Relationships

- **Controllers** (`post-return.ts`, `post-return-decision.ts`, `post-return-receive.ts`, `post-return-cancel.ts`, `post-return-close.ts`, `post-return-proof.ts`, `get-return.ts`, `get-returns.ts`, `get-return-options.ts`) — import `returnService` (and the re-exported types) from this file to perform their operations.
- **`src/modules/returns/module.ts`** — registers/binds `returnService` for dependency injection.
- **`src/modules/returns/index.ts`** — re-exports `returnService` upward so the module's public surface stays flat.
- **Sibling service files** (`./create`, `./decide`, `./receive`, `./proof`, `./close`, `./cancel`, `./personal-data`, `./read`, `./options`, `./retention`, `./notify`, `./stats`, `./digest`) — the actual implementations that this file imports and re-surfaces.

## Notes

- The file is intentionally a pure re-export + object-assembly layer; it contains no logic of its own. If a function signature changes, update the owning sibling file — this file will pick it up automatically.
- All methods on `returnService` are unbound (not `this`-aware), so they can be destructured or passed around freely.
- The JSDoc comment describes each sibling's one-liner purpose; useful for quick orientation without opening every file.
