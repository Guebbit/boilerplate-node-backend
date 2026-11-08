---
source: src/modules/audit-logs/metrics.ts
sha256: a3a2980e48c9b574acc88a50e647bc2902c576deee5a1cd630dce66781e55d55
generated_at: 2026-11-08T05:07:46.295399+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/metrics.ts

## Purpose

Declares the Prometheus domain counters owned by the audit-logs module. Metrics live here (in the module) rather than in `infrastructure` so the overview endpoint can read them without importing this file. Currently tracks one counter: audit sink persistence failures.

## Key elements

- **`auditSinkFailuresTotal`** (`Counter`) — A Prometheus counter registered on the shared `metricsRegistry`. Incremented when an audit entry is written to the compliance log but not persisted to the queryable trail. Exposed as `audit_sink_failures_total`.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Imports `metricsRegistry` to register the counter on the application-wide registry.
- **`src/modules/audit-logs/service.ts`** — The service's `record()` method is the expected caller that increments this counter when a sink persistence failure is swallowed.
- **`src/modules/audit-logs/tests/unit/service.test.ts`** — Unit tests for the service; expected to assert counter increments on the sink-failure path.

## Notes

- **Fail-open is intentional.** `record()` deliberately swallows persistence failures so that `GET /observability/audit` returns `{ items: [] }` rather than erroring. The doc comment explicitly warns against making the sink awaitable to "fix" the non-zero counter — the silence is the design, not a bug.
- The file's module comment cross-references `modules/account/metrics.ts` as the canonical explanation for why domain metrics live in the module directory rather than in `infrastructure`.
