---
source: src/infrastructure/observability/metrics-outbox.ts
sha256: 0145deb70b0a1d870cb37436a9f099b95135ae158e79ffc2fff899ffe8f89c0e
generated_at: 2026-11-08T03:40:24.153164+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-outbox.ts

## Purpose

Defines the Prometheus metrics (three counters, one gauge) that report transactional-outbox activity. Counters give the relay a zero-DB-cost signal for publish/retry/dead events; the gauge exposes the pending-row count via a scrape-time database read. The file lives in the observability layer, which sits *below* the kernel, so it cannot import the outbox model directly.

## Key elements

- **`outboxEventsPublishedTotal`** (Counter) – Incremented each time an event is dispatched and marked published. A duplicate publish counts again.
- **`outboxEventsRetriedTotal`** (Counter) – Incremented on dispatch attempts that fail and are rescheduled with backoff.
- **`outboxEventsDeadTotal`** (Counter) – Incremented when an event is parked as `dead` after exhausting all attempts. A non-zero rate is the `OutboxEventsDead` alert.
- **`setOutboxPendingReader(reader)`** – Injection point. The outbox model's owner calls this once to hand a `() => Promise<number>` reader to the gauge, avoiding a reverse dependency.
- **`_outboxPendingGauge`** (Gauge, private) – Calls the injected reader at scrape time to report how many rows are still `pending`. Silently returns if no reader is set or if Mongoose is not connected.

## Relationships

- **`./metrics-registry.ts`** – Supplies the shared `metricsRegistry` instance; every metric here registers against it.
- **`./metric-config.ts`** – Supplies `counterConfig` / `gaugeConfig` factories so metric names, labels, and help text are centralised.
- **`@kernel/outbox`** (via `src/kernel/outbox.ts`) – The gauge counts the outbox collection's `pending` rows, but the file **does not import** it. The coupling is inverted: the outbox owner calls `setOutboxPendingReader` to provide a reader closure.

## Notes

- The gauge skips collection (returns `undefined`) when `mongoose.connection.readyState` is not `connected`, keeping scrapes fast during outages.
- `readPendingCount` starts as `undefined`; if `setOutboxPendingReader` is never called the gauge simply never reports a value.
- All metric metadata (names, labels, help strings) comes from `metrics.generated` (`infrastructureMetricData`), keeping this file free of hard-coded metric names.
- The file is tagged `@module` (side-effect import) — it has no default export and is consumed for its exported bindings only.
