---
source: src/modules/webhooks/metrics.ts
sha256: 28e654cd47de6135ab05b25d0c255248be3c92ec8738fa5d78d560dd19e2987b
generated_at: 2026-09-23T19:40:16.314932+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/metrics.ts

## Purpose

Defines the webhooks module's domain-level Prometheus metrics and registers them on the shared `metricsRegistry`. The metrics exist to power two fleet-wide alerts — `WebhookDeliveriesFailingEverywhere` and `WebhookRetriesStalled` — that detect our-side outages (all deliveries failing, retry sweep stalled) as distinct from a single subscriber's endpoint being down.

## Key elements

- **`webhookDeliveryAttemptsTotal`** (Counter, exported) — Increments per delivery attempt, labelled by `outcome` (`success` | `failure`). The success/failure ratio is the signal the "failing everywhere" alert reads.
- **`webhookSubscriptionsAutoDisabledTotal`** (Counter, exported) — Increments when a subscription is auto-disabled for sustained failure. Unlabelled; the alert cares about volume only.
- **`_webhookDeliveriesOverdue`** (Gauge, **not exported**) — Populated via a `collect()` callback at scrape time by querying the repository for `pending` rows whose `nextAttemptAt` is older than `OVERDUE_THRESHOLD_MS` (10 min). A nonzero, growing value signals the retry sweep itself has stopped.
- **`OVERDUE_THRESHOLD_MS`** — Module-private constant: `10 * 60 * 1000`.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Supplies the `metricsRegistry` instance passed to every metric's `registers` array so all webhooks metrics appear on the single `/metrics` endpoint alongside HTTP and other module metrics.
- **`src/modules/webhooks/repository.ts`** — Provides `webhookDeliveryRepository`, consumed inside the `_webhookDeliveriesOverdue` gauge's `collect()` callback to perform the overdue-row count query at scrape time.
- **`src/modules/webhooks/services/attempt.ts`** — The delivery-attempt flow that this file's counters are designed to be incremented by (success/failure outcomes, auto-disable events). The dependency direction is the reverse: attempt.ts imports these exports.

## Notes

- `_webhookDeliveriesOverdue` is intentionally **not exported**; it has no direct `.inc()`/`.set()` call sites — its value is derived entirely from the DB at scrape time. External code cannot accidentally mutate it.
- The gauge's `collect()` performs a live DB query on **every** scrape. This is a deliberate trade-off (same pattern as `inventory/metrics.ts` low-stock gauge) but means scrape latency and DB load are coupled to the metrics endpoint.
- The file deliberately lives in the module rather than `infrastructure/` (see `modules/account/metrics.ts` precedent) so the metrics co-locate with the domain logic they describe.
