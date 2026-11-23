---
source: src/modules/payments/metrics.ts
source_sha256: 4fcaf525e6730370ddb1e81ad4b0a71f1755ac39dce1b88d487566ef0c826802
context_sha256: 67a41705a76dc9d9b338730e310efd5a0aabb181b63cf817b3fbf6651f2ad490
generated_at: 2026-11-22T06:45:51.443627+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/metrics.ts

## Purpose
Declares the Prometheus counters owned by the payments module and registers them on the shared `metricsRegistry`. They live in the module rather than in `infrastructure`; the file's header points to `src/modules/account/metrics.ts` for the rationale and for how the overview endpoint reads them without importing this file.

## Key elements
- `paymentConfirmTotal` (`payment_confirm_total`): confirm attempts, labelled by `outcome`. The ratio between outcomes is the signal, so outcomes are kept as labels rather than summed.
- `paymentAmountMismatchTotal` (`payment_amount_mismatch_total`): provider-reported `succeeded` payments whose amount, currency or payment id differ from the frozen payment. Labelled by `field`. Any increment calls for a reconciliation.
- `paymentWebhookDroppedTotal` (`payment_webhook_dropped_total`): signed provider webhooks refused because the adapter could not read the body or the result failed the contract schema. Labelled by `reason`. Any increment means a reader is broken and a dispute or refund message was dropped.
- Zero-initialisation at module load:
  - `paymentAmountMismatchTotal` is incremented by 0 for `amount`, `currency` and `paymentId`.
  - `paymentWebhookDroppedTotal` is incremented by 0 for `reason: 'unreadable'`.
  - Both exist so an `increase()` alert sees the first event after a restart.

## Relationships
- `src/infrastructure/observability/metrics-registry.ts`: supplies `metricsRegistry`, the registry all three counters are registered on.
- `src/modules/payments/services/settlement.ts`: compares the fields (`amount`, `currency`, `paymentId`) that the mismatch counter's pre-seeded labels mirror.
- `src/modules/payments/controllers/post-payment-confirm.ts` and `src/modules/payments/controllers/post-payment-webhook.ts`: neighbours in the dependency graph. The confirm and webhook counters match their domains. The file content does not show which code increments which counter.
- `src/modules/payments/tests/integration/settlement-mismatch.test.ts` and `src/modules/payments/tests/integration/webhook-dropped.test.ts`: integration tests for the mismatch and dropped-webhook scenarios, which these counters track.

## Notes
- Signature failures are deliberately not counted in `payment_webhook_dropped_total`. `security_events_total` owns them.
- If a new label value is added to the mismatch or dropped counters, add a matching zero-init line, or the first-event alert gap returns for that label. The `outcome` label on the confirm counter is not pre-seeded.
- The `paymentWebhookDroppedTotal` zero-init covers only the `unreadable` reason.
