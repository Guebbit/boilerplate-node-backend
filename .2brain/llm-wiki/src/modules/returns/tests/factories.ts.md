---
source: src/modules/returns/tests/factories.ts
sha256: e03800b2dc686e36c820d18bce4d1597688f971bb052ee64a2d133eaacdfe4f2
generated_at: 2026-11-14T21:42:15.187531+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/factories.ts

## Purpose

Provides a minimal return-document factory for integration tests *outside* the returns module (e.g. shop-tasks tests) that only need to seed rows for a "count by status and age" query. It deliberately bypasses the service layer and validation so tests can insert bare documents without setting up orders, lines, or money.

## Key elements

- **`BareReturn`** (interface) — The subset of fields a count-by-status-and-age query reads: `status` (`'requested' | 'approved'`), `reason`, `daysAgo`, and optional `proof` flag.
- **`insertBareReturns(rows)`** (exported function) — Maps each `BareReturn` to a minimal MongoDB document (`kind: 'return'`, a single `createdAt`/`requestedAt`/`decidedAt` timestamp derived from `daysAgo`, optional `proofOfSendingAt`) and calls `returnModel.collection.insertMany` directly.

## Relationships

- **`src/modules/returns/model.ts`** — Imports `returnModel` to access the underlying collection for the raw `insertMany` call.
- **`src/domain-primitives/time.ts`** — Imports `DAY_MS` to convert the `daysAgo` field into a concrete `Date` offset.
- **`src/modules/shop-tasks/tests/integration/digest.test.ts`** and **`work-summary.test.ts`** — Downstream consumers that seed bare returns via `insertBareReturns` to exercise their count/aggregation logic.

## Notes

- The function intentionally skips the returns service and any validation (no order reference, no line items, no monetary fields). If a test needs full referential integrity, this factory is the wrong tool.
- `kind` is hardcoded to `'return'` on every inserted document; callers do not supply it.
- All timestamp fields (`createdAt`, `requestedAt`, `decidedAt`, `proofOfSendingAt`) share the same computed date. There is no way to express, for example, a decision made later than the request.
