---
source: src/modules/returns/tests/factories.ts
sha256: f0fd137638928e8610cbe40d0e2132242ead0608343c43d29662fe1dad245632
generated_at: 2026-11-08T08:07:10.864655+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/factories.ts

## Purpose

Provides a minimal, validation-free way to seed return documents into the database for integration tests that live **outside** the returns module. It exists so those tests can create the few fields a "count by status and age" query actually reads, without constructing full return objects with lines, orders, or monetary amounts.

## Key elements

- **`BareReturn`** (interface) — The minimal shape a consumer passes in: `status` (`'requested' | 'approved'`), `reason`, and `daysAgo` (age in days).
- **`insertBareReturns`** (exported const, `(rows: readonly BareReturn[]) => Promise<unknown>`) — Maps each `BareReturn` into a MongoDB document (`status`, `kind: 'return'`, `reason`, `createdAt`) and calls `returnModel.collection.insertMany`. Returns whatever `insertMany` resolves to (typed as `unknown`).

## Relationships

- **`src/modules/returns/model.ts`** — Imports `returnModel` and uses its `.collection.insertMany` to write documents directly.
- **`src/domain-primitives/time.ts`** — Imports `DAY_MS` to convert the human-friendly `daysAgo` value into a concrete `createdAt` timestamp.
- **`src/modules/shop-tasks/tests/integration/digest.test.ts`** and **`work-summary.test.ts`** — Downstream consumers that seed bare returns and then assert on aggregate counts, without needing full return documents.

## Notes

- The module doc explicitly states the factory is for tests **outside** the returns module; do not reach for it from within `src/modules/returns/tests/`.
- `insertBareReturns` deliberately skips all application-level validation (lines, order linkage, money). If a test needs a *full* return, this factory will not help.
- The return type is `Promise<unknown>` — callers should not rely on the insert result carrying typed information.
