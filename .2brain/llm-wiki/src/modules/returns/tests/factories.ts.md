---
source: src/modules/returns/tests/factories.ts
sha256: df4b38fea911a988cde8ebe8b173748db840483c0c8e2f13e2d40a56d82be043
generated_at: 2026-10-29T05:45:52.486184+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/factories.ts

## Purpose

Provides a minimal return-row fixture for **cross-module** tests (e.g. notifications) that only need a countable return document in the database—no lines, orders, or money. It writes directly to the collection, bypassing the returns service and its validation, so external tests can seed the few fields a status-and-age aggregation actually reads.

## Key elements

- **`BareReturn`** (interface) – The minimal shape a caller supplies: `status` (`'requested' | 'approved'`), `reason`, and `daysAgo` (elapsed time used to back-date the document).
- **`insertBareReturns(rows)`** – Maps each `BareReturn` to a full document (`status`, `kind: 'return'`, `reason`, `createdAt` computed as `now − daysAgo × 86 400 000 ms`) and writes them via `returnModel.collection.insertMany`. Returns the raw MongoDB `InsertManyResult`.

## Relationships

- **`src/modules/returns/model.ts`** – Imports `returnModel`; calls `returnModel.collection.insertMany` to write documents directly to the same collection the service layer uses.
- **`src/modules/notifications/tests/integration/digest.test.ts`** – Intended consumer: seeds bare returns so the digest notification logic can query returns by status and age without needing a fully validated return document.

## Notes

- **Intentionally skips service-level validation.** No order, line-item, or monetary checks are performed. If a test needs those invariants, use the returns service instead.
- **`kind: 'return'` is set implicitly.** Callers do not supply it; the factory hard-codes the discriminator so the document is correctly typed in the shared collection.
- **`daysAgo` is a relative offset, not an absolute date.** The `createdAt` is computed at call time (`Date.now() − daysAgo * 86_400_000`), so assertions that compare "created X days ago" must account for the moment of insertion.
