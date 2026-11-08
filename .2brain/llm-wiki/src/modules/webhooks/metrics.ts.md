---
source: src/modules/webhooks/metrics.ts
sha256: 8887df9c7c2288166136661f0dfda7dfd84ff30051ae5d30c44ad8dd02e8ab55
generated_at: 2026-11-08T09:03:18.175636+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/metrics.ts

## Purpose

Defines and registers the webhooks module's domain metrics on the shared `metricsRegistry`. These metrics exist to power two fleet-wide alerts (`WebhookDeliveriesFailingEverywhere`, `WebhookRetriesStalled`) that detect our-side outages in the delivery path, as distinct from per-subscription auto-disable events.

## Key elements

- **`webhookDeliveryAttemptsTotal`** (Counter, exported) — Incremented per delivery attempt, labelled by `outcome` (`success` | `failure`). The success/failure ratio is what the fleet-wide failure alert reads.
- **`webhookSubscriptionsAutoDisabledTotal`** (Counter, exported) — Unlabelled counter for subscriptions auto-disabled after sustained failure. Volume-only; no per-subscription breakdown.
- **`_webhookDeliveriesOverdue`** (Gauge, *not* exported) — Scrape-time gauge that queries the repository for `pending` rows whose `nextAttemptAt` is >10 min in the past. A non-zero, growing value signals the retry sweep itself has stopped.
- **`OVERDUE_THRESHOLD_MS`** (const) — `10 * MINUTE_MS`; the cutoff for "overdue" used by the gauge.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — All three metrics register against `metricsRegistry` so a single `/metrics` scrape returns them alongside HTTP and other module metrics.
- **`src/modules/webhooks/repository.ts`** — The `_webhookDeliveriesOverdue` gauge's `collect()` calls `webhookDeliveryRepository.count({ status: 'pending', nextAttemptAt: { $lt: … } })`.
- **`src/domain-primitives/time.ts`** — Imports `MINUTE_MS` to compute `OVERDUE_THRESHOLD_MS`.
- **`src/modules/webhooks/services/attempt.ts`** — Consumes the exported `webhookDeliveryAttemptsTotal` counter (not imported *by* this file; the direction is attempt → this module).

## Notes

- The overdue gauge is deliberately **not exported** (underscore-prefixed). It is a pure scrape-time computation with no imperative `.inc()`/`.set()` call sites in application code.
- `labelNames` on the attempts counter uses an `as const` tuple to get literal typing on the label.
- The module doc block cross-references `docs/tools/prometheus.md` for the alert definitions and `docs/modules/webhooks.md` for the delivery-path context; see `modules/account/metrics.ts` for the pattern of keeping module metrics out of `infrastructure/`.
