---
source: src/modules/observability/services/job-health.ts
sha256: 0476c40cb392c4e35d26c84a5ab9179c94eb0c6dd9e7373957e16d2150cd061c
generated_at: 2026-09-27T15:05:26.252270+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/job-health.ts

## Purpose

Provides the job-status half of the `GET /observability/health` endpoint. It reports every crontab job's last observed outcome by issuing a single read against the `leases` collection (populated by `scripts/run-script.ts` and, where applicable, `withLease`). It exists because no in-memory copy of "when did `reap:orders` last finish" lives in the process.

## Key elements

- **`jobHealth(): Promise<ObservabilityHealthJob[]>`** — The sole export. Calls `listLeaseSummaries()` and maps each summary to the wire shape declared by `ObservabilityHealthJob`: `name`, `lastSuccessAt` (converted via `toISOString()`), and `lastError`.

## Relationships

- **`src/infrastructure/persistence/lease.ts`** — Source of `listLeaseSummaries`, the only I/O this module performs.
- **`src/types/index.ts`** — Supplies the `ObservabilityHealthJob` type that shapes the return value.
- **`src/modules/observability/services/health.ts`** — Consumes `jobHealth` to assemble the full `GET /observability/health` response.
- **`src/modules/observability/services/index.ts`** — Barrel re-export for external consumers.
- **`src/modules/observability/tests/unit/job-health.test.ts`** — Unit tests for this module.

## Notes

- Unlike the sibling `dependency-health.ts`, this module **does** perform I/O (one `leases` query). Callers should treat it as async and account for database latency.
- `lastSuccessAt` is optional in the lease summary; the mapping passes `undefined` through if a job has never succeeded.
- Timestamps are serialized as ISO-8601 strings to stay consistent with every other timestamp the health endpoint reports.
