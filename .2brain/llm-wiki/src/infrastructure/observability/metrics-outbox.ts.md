---
source: src/infrastructure/observability/metrics-outbox.ts
sha256: ea4892b88c56c62cd3f8e726cc7148817119efcf2ca6cc7e7d49228e656c8d48
generated_at: 2026-10-14T08:06:25.222666+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-outbox.ts

## Purpose

Defines the Prometheus metrics (three counters, one gauge) for the transactional-outbox pattern. The counters are cheap, in-memory counters the relay process can increment without a DB round trip; the gauge answers "how many events are still waiting" by reading the database at scrape time.

## Key elements

- **`outboxEventsPublishedTotal`** (Counter) – incremented each time an event is dispatched to consumers and marked published. Duplicate publishes count again.
- **`outboxEventsRetriedTotal`** (Counter) – incremented on failed dispatch attempts that are rescheduled with backoff.
- **`outboxEventsDeadTotal`** (Counter) – incremented when an event exhausts all attempts and is parked as `dead`. A non-zero rate is the `OutboxEventsDead` alert.
- **`setOutboxPendingReader(reader)`** – one-time injection point. The owner of the outbox model supplies a `() => Promise<number>` that counts rows still `pending`. Stored in a module-level `readPendingCount` variable.
- **`_outboxPendingGauge`** (Gauge, not exported) – `outbox_pending_events`. Its `collect` callback calls the injected reader at scrape time. Skips the DB call if no reader is set or if `mongoose.connection.readyState` is not `connected`, so a scrape never blocks on a dead connection.

## Relationships

- **`./metrics-registry`** – every metric in this file passes `registers: [metricsRegistry]`, so all outbox metrics are exposed on the shared registry used by the scrape endpoint.
- **`src/kernel/outbox.ts`** – the outbox model (owner) calls `setOutboxPendingReader` with a query function that counts `pending` rows. This file deliberately does **not** import the model; the dependency direction is enforced by layering (observability sits below kernel).

## Notes

- The gauge reads Mongo **at scrape time**, not at write time, because the writer, relay, and scraper may each run in a different process.
- The gauge silently returns `undefined` (no value set) when Mongo is disconnected — a scrape must stay fast; this mirrors the job-gauge convention.
- `_outboxPendingGauge` is intentionally non-exported; consumers get the metric via the registry, not by importing the gauge object.
- All metrics are counters except the pending gauge; the module docblock states counters are chosen specifically because they require no DB access to report.
