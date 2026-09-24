---
source: src/modules/audit-logs/metrics.ts
sha256: a3a2980e48c9b574acc88a50e647bc2902c576deee5a1cd630dce66781e55d55
generated_at: 2026-09-23T18:26:33.198973+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/metrics.ts

## Purpose

Defines the domain-owned Prometheus counter for the audit-logs module. The counter tracks audit entries that made it into the compliance log but failed to persist into the queryable trail, giving operators a signal for the deliberate fail-open path in `record()`.

## Key elements

- **`auditSinkFailuresTotal`** (`Counter`, exported) — `audit_sink_failures_total`. Incremented whenever an audit entry is written to the compliance log but not persisted to the queryable trail. Registered against the shared `metricsRegistry`.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Provides the `metricsRegistry` instance; this file passes it as the sole entry in the Counter's `registers` array.
- **`src/modules/audit-logs/service.ts`** — The consumer that increments this counter when a sink/persistence failure is swallowed by `record()`.
- **`src/modules/audit-logs/tests/unit/service.test.ts`** — Unit tests that exercise the failure path and assert the counter is incremented.

## Notes

- The fail-open design is **intentional**: `record()` swallows persistence failures so `GET /observability/audit` can silently return `{ items: [] }`. The doc comment explicitly warns against making the sink awaitable to "fix" this to zero.
- The module doc references `modules/account/metrics.ts` for the rationale on why counters live in the module rather than in `infrastructure`, and how the overview endpoint reads them without a direct import.
