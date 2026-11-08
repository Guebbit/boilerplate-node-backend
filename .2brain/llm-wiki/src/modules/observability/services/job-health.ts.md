---
source: src/modules/observability/services/job-health.ts
sha256: 0476c40cb392c4e35d26c84a5ab9179c94eb0c6dd9e7373957e16d2150cd061c
generated_at: 2026-11-08T06:41:14.350323+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/job-health.ts

## Purpose

Provides the job section of the `GET /observability/health` endpoint. It reports each crontab job's last observed success or error by reading the `leases` document, because no in-memory copy of "when did `reap:orders` last finish" exists in the process.

## Key elements

- **`jobHealth`** (exported function) — Calls `listLeaseSummaries()` and maps each summary into the `ObservabilityHealthJob` wire shape: `name`, `lastSuccessAt` (converted to an ISO-8601 string via `.toISOString()`), and `lastError`. Returns `Promise<ObservabilityHealthJob[]>`.

## Relationships

- **`src/infrastructure/persistence/lease.ts`** — Sole I/O dependency; supplies `listLeaseSummaries`.
- **`src/modules/observability/services/health.ts`** — Consumes `jobHealth` to assemble the full health payload.
- **`src/modules/observability/services/index.ts`** — Barrel re-export of `jobHealth`.
- **`src/types/index.ts`** — Source of the `ObservabilityHealthJob` type used as the return type.
- **`src/modules/observability/tests/unit/job-health.test.ts`** — Unit tests for the mapping logic.

## Notes

- Unlike `dependency-health.ts`, this module **does perform I/O** (one `leases` query) per call.
- `lastSuccessAt` may be `undefined`; the mapping uses optional chaining (`summary.lastSuccessAt?.toISOString()`), so the field is `string | undefined` in the wire shape.
- The underlying lease data is written by `scripts/run-script.ts` on every job execution, and additionally by `withLease` for jobs wrapped in that utility.
