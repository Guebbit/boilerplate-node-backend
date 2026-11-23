---
source: src/modules/audit-logs/metrics.ts
source_sha256: a3a2980e48c9b574acc88a50e647bc2902c576deee5a1cd630dce66781e55d55
context_sha256: 3b7af48ce6a6546384762bc0f4402deed0f3f8dd9016b03dda563faf36b3b392
generated_at: 2026-11-22T04:26:36.166128+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/audit-logs/metrics.ts

## Purpose
Declares the Prometheus counter(s) owned by the audit-logs module. The counters live in the module rather than in `infrastructure`; the file's header points to `src/modules/account/metrics.ts` for the rationale and for how the overview endpoint reads them without importing this file.

## Key elements
- `auditSinkFailuresTotal` — a `prom-client` `Counter` named `audit_sink_failures_total`. It counts audit entries that were written to the compliance log but not persisted to the queryable trail. It is registered on the shared `metricsRegistry`.

## Relationships
- `src/infrastructure/observability/metrics-registry.ts` — supplies `metricsRegistry`, the registry the counter is attached to via `registers: [metricsRegistry]`.
- `src/modules/audit-logs/service.ts` — the doc comment ties the counter to `record()`, which swallows persistence failures. This is the likely place the counter is incremented, but the increment is not visible in this file.
- `src/modules/audit-logs/tests/unit/service.test.ts` — a neighbor in the graph. This file does not show how it uses the counter.

## Notes
- The counter exists because `record()` fails open on purpose. A failure to persist makes `GET /observability/audit` return `{ items: [] }`, which looks the same as "nothing happened". This counter is the only signal that entries were lost.
- Do not make the sink awaitable to drive the counter to zero. The fail-open behavior is intentional, not a gap.
