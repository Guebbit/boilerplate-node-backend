---
source: src/infrastructure/observability/metrics-outbox.ts
sha256: 0145deb70b0a1d870cb37436a9f099b95135ae158e79ffc2fff899ffe8f89c0e
generated_at: 2026-10-29T02:10:22.192070+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-outbox.ts

## Purpose

Defines the Prometheus metrics (three counters + one gauge) that track transactional-outbox throughput in the relay process. Counters report without a database round trip; the single gauge reads Mongo at scrape time to expose how many events are still pending publication.

## Key elements

- **`outboxEventsPublishedTotal`** (Counter) — Incremented each time the relay dispatches an event and marks it published. Duplicate publishes count again.
- **`outboxEventsRetriedTotal`** (Counter) — Incremented on a failed dispatch attempt that is rescheduled with backoff.
- **`outboxEventsDeadTotal`** (Counter) — Incremented when an event is parked as `dead` after exhausting all attempts. A rate above zero is the `OutboxEventsDead` alert.
- **`setOutboxPendingReader(reader)`** — Injects an async `() => Promise<number>` that returns the count of rows still `pending`. Called once by the owner of the outbox model.
- **`_outboxPendingGauge`** (Gauge, module-private) — At scrape time, invokes the registered reader and sets the gauge. Silently skipped if no reader is registered or Mongo is not connected (keeps scrape latency bounded).

## Relationships

- **`metrics-registry.ts`** — All four metrics register against the shared `metricsRegistry` instance so they appear on the single `/metrics` endpoint.
- **`metric-config.ts`** — Supplies `counterConfig` / `gaugeConfig` helpers that expand the generated name, description, and labels into the shape `prom-client` expects.
- **`metrics.generated.ts`** — Provides the typed `infrastructureMetricData` entries (names, help text, label names) consumed by the config helpers.
- **`src/kernel/outbox.ts`** — The gauge *cannot* import this module (observability sits below kernel in the dependency graph). Instead, the outbox model's owner calls `setOutboxPendingReader` with a closure that queries its own collection. This is the sole interaction; no import exists in this file.

## Notes

- The gauge's `collect` callback is **async** (returns a Promise). `prom-client` awaits it, but if Mongo is unreachable the function returns early rather than hanging the scrape.
- `setOutboxPendingReader` overwrites the previous reader. Call it exactly once during startup; calling it a second time replaces the first silently.
- Counters are monotonically increasing; they are not reset between restarts unless the process is killed (Prometheus standard).
- The file exports only the three counters and `setOutboxPendingReader`; the gauge itself is intentionally private, accessible solely through the shared registry.
