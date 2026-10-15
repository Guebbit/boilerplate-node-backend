---
source: src/modules/webhooks/services/attempt.ts
sha256: 74c5eb70720dc3c088e912ec250fe272f7fd1c93201600c1b255ed3d176dc796
generated_at: 2026-10-15T12:20:52.520664+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/attempt.ts

## Purpose

Implements the single delivery-attempt pipeline shared by both the queued consumer path (`processDeliveryJob`) and the synchronous admin re-send path (`replay` in `deliveries.ts`). Given an already-claimed delivery row and its subscription, it performs the HTTP POST, then records the outcome (success, retry, or exhaustion) on the delivery row and the subscription's failure streak. The shared recording logic prevents the two call-sites from diverging on what "recording an outcome" means.

## Key elements

- **`attemptDelivery`** (exported) — Entry point. Checks subscription is enabled and has an active secret, signs and POSTs via `deliverWebhook`, then delegates to `recordSuccess` or `recordFailure`. Returns `null` if the lease was lost mid-attempt.
- **`recordSuccess`** — Writes `succeeded` on the delivery row, resets the subscription's failure streak via `webhookSubscriptionRepository.recordOutcome`, increments the success metric.
- **`recordFailure`** — Computes the next backoff slot; if one remains, writes `pending` with an incremented attempt counter (no subscription write). If the ladder is exhausted, delegates to `recordExhaustion`.
- **`recordExhaustion`** — Writes `exhausted`, counts the failure against the subscription's consecutive-failure streak, and if `shouldAutoDisable` passes, disables the subscription, increments the auto-disable metric, and fires the owner notification.
- **`finalizeUndeliverable`** — Terminal write (`exhausted`, no response data) for the case where the subscription is disabled or has no active secret; nothing to attempt.
- **`notifyOwnerOfAutoDisable`** — Emits a `system`-actor audit event, then best-effort resolves the owner's email via `userService.getById` and enqueues a localized notification. Fire-and-forget; a failed lookup only loses the courtesy email.
- **`requireLeaseToken`** — Narrows the optional `leaseToken` to a required `string`; throws if absent (indicates an upstream bug, not a reachable production state).

## Relationships

- **`webhooks/repository.ts`** — All outcome writes go through `webhookDeliveryRepository.applyOutcome` and `webhookSubscriptionRepository.recordOutcome` / `.disable`; the lease-token guard in `applyOutcome` is the race-safety mechanism.
- **`webhooks/domain/backoff.ts`** — Provides `nextAttemptAt` (retry scheduling) and `shouldAutoDisable` (streak threshold).
- **`webhooks/model.ts`** — Supply types `WebhookDeliveryDocument` and `WebhookSubscriptionDocument`; documents the `leaseToken` contract.
- **`webhooks/metrics.ts`** — Emits `webhookDeliveryAttemptsTotal` (success/failure labels) and `webhookSubscriptionsAutoDisabledTotal`.
- **`webhooks/emails.ts`** — Provides `subscriptionDisabledEmail` template for the owner notification.
- **`webhooks/audit.ts`** — Provides the `SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` action constant.
- **`infrastructure/observability/audit.ts`** — `emitAuditEvent` for the auto-disable audit entry.
- **`infrastructure/adapters/mailer.ts`** — `enqueueEmail` for the owner notification.
- **`infrastructure/adapters/logger.ts`** — Logs the error if the owner-lookup email path fails.
- **`infrastructure/i18n/index.ts`** — `getDefaultLocale` for the notification email.
- **`modules/users/index.ts`** — `userService.getById` to resolve the owner's email address.
- **`webhooks/module.ts`** — Registers `processDeliveryJob` (the queued caller of `attemptDelivery`) in its consumer manifest.

## Notes

- **Lease-token race handling:** If `applyOutcome` returns `null` (another worker re-claimed the row), the outcome is silently dropped—never retried. The other owner now owns the row.
- **Single-attempt vs. chain failure:** A single failed HTTP response does *not* increment the subscription's `consecutiveFailures`. Only an exhausted backoff chain (all retries spent) counts as a failure for the auto-disable streak. This is intentional: "sustained failure" means the whole chain gave up.
- **Idempotent timestamp:** The payload's `timestamp` is `delivery.createdAt` (event time), not `Date.now()`, so every retry of the same delivery carries an identical timestamp.
- **Subscription is caller-supplied:** `attemptDelivery` does not re-fetch the subscription. This lets `replay` and the queued path each load it their own way without a redundant read.
- **`actorUserId: 'system'`:** The auto-disable audit entry is attributed to `system` because there is no `CallerContext` in a background worker; it is not attributable to any admin or tenant user.
- **Email is fire-and-forget:** `enqueueEmail` is not awaited; a failure only loses the courtesy notification, not the audit record or the disable itself.
