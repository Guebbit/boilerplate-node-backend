---
source: src/infrastructure/observability/metrics-outbox.ts
source_sha256: 12d89f8ddbd16c263e48a09842673000d911f237c92b5e999dbd7108d5031838
context_sha256: d0b354b138a58fe28e7d77dbf4205da294130a99fc9e9c5d9cb6e243c527ef15
generated_at: 2026-11-22T02:59:32.487356+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/metrics-outbox.ts

## Purpose
Defines the Prometheus metrics for the transactional outbox: three counters the relay increments (in whichever process runs it) and a gauge reporting how many events are still waiting. Observability sits below the kernel, so the gauge cannot import the outbox model it counts. Instead, the model's owner injects a reader function.

## Key elements
- `outboxEventsPublishedTotal` — Counter of events the relay dispatched and marked published. A duplicate publish counts again.
- `outboxEventsRetriedTotal` — Counter of failed dispatch attempts that were rescheduled with backoff.
- `outboxEventsDeadTotal` — Counter of events parked as `dead` after exhausting all attempts. A non-zero rate is the `OutboxEventsDead` alert.
- `setOutboxPendingReader(reader)` — Registers an async `() => Promise<number>` returning the number of rows still `pending`. It is stored in a module-level variable.
- `_outboxPendingGauge` (not exported) — Gauge for `outbox_pending_events`. Its `collect()` calls the registered reader at scrape time and sets the gauge to the result.

## Relationships
- `metric-config.ts` — supplies `counterConfig` and `gaugeConfig`, which build each metric's options from the generated infrastructure metric data.
- `metrics-registry.ts` — all four metrics are registered on `metricsRegistry`.
- `src/kernel/outbox.ts` — not imported here (by design). The kernel's outbox owner is expected to call `setOutboxPendingReader`, and the relay is the source of the counter increments.
- `tests/integration/kernel/outbox.test.ts` — the outbox integration test; its link to this file comes from the dependency graph.

## Notes
- The gauge reads the database at scrape time, because the writer and relay may run in a different process from the one being scraped.
- `collect()` does nothing if no reader is registered or if `mongoose.connection.readyState` is not `connected`. This keeps scrapes fast while Mongo is down, as the job gauge does.
- If the reader rejects, the error is swallowed and the gauge keeps its previous value.
- Until `setOutboxPendingReader` is called, the gauge is never updated.
