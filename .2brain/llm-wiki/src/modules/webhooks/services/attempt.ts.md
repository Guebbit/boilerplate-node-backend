---
source: src/modules/webhooks/services/attempt.ts
sha256: 78f0884f7799a5290205e43e506892b0269ba855e402714e83e5a468827dd9ca
generated_at: 2026-09-27T15:43:35.831701+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/attempt.ts

## Purpose

Implements the single shared code path for "attempt one webhook delivery and record the outcome." It signs the payload, performs the SSRF-guarded POST via `deliverWebhook`, then writes the result (success, retryable failure, or exhaustion) onto the delivery row and the subscription's failure streak. Both the queued worker path (`processDeliveryJob` in `module.ts`) and the synchronous admin replay path (`deliveries.ts`) funnel through `attemptDelivery` so the two cannot drift on what recording an outcome means.

## Key elements

- **`attemptDelivery`** *(exported)* — Entry point. Validates the subscription is enabled and has at least one active ring secret, builds the Standard Webhooks envelope (`type`, `timestamp`, `data`), calls `deliverWebhook`, then routes to `recordSuccess` or `recordFailure`. Returns the updated delivery document or `null` if the lease was lost mid-attempt.
- **`notifyOwnerOfAutoDisable`** *(internal)* — Fires an `AuditEvent` (`SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED`) and a best-effort courtesy email to the subscription owner. No-op when `disable` found nothing to disable.
- **`requireLeaseToken`** *(internal)* — Narrows the optional `leaseToken` to a required `string`; throws if missing (guards against an unclaimed row reaching `applyOutcome`).
- **`finalizeUndeliverable`** *(internal)* — Marks the delivery `exhausted` when there is nothing to attempt (disabled subscription, no active secret).
- **`recordSuccess`** *(internal)* — Increments the success metric, writes `status: 'succeeded'` to the delivery, and resets the subscription's failure streak via `webhookSubscriptionRepository.recordOutcome(id, true)`.
- **`recordFailure`** *(internal)* — Increments the failure metric. If `nextAttemptAt` yields a future timestamp, schedules the next retry (leaves row `pending`, bumps `attempt`). Otherwise delegates to `recordExhaustion`.
- **`recordExhaustion`** *(internal)* — Writes `status: 'exhausted'`, increments the subscription's failure streak, and if `shouldAutoDisable` fires, disables the subscription, increments the auto-disable metric, and calls `notifyOwnerOfAutoDisable`.
- **`deliverIfPossible`** *(internal, truncated)* — Wraps `attemptDelivery` to tolerate a possibly-missing subscription lookup.

## Relationships

- **`../transport/webhook-delivery`** (`deliverWebhook`) — performs the actual signed, SSRF-guarded HTTP POST.
- **`../repository`** (`webhookDeliveryRepository`, `webhookSubscriptionRepository`) — all outcome writes go through `applyOutcome` (lease-token-guarded) and `recordOutcome` / `disable`.
- **`../domain`** (`nextAttemptAt`, `shouldAutoDisable`) — backoff scheduling and auto-disable threshold logic.
- **`../secrets`** (`activeRingSecrets`) — selects which HMAC key to sign with.
- **`../config`** (`getWebhookDemoAllowedHost`) — supplies the optional insecure-host exemption for the SSRF guard in dev/test.
- **`../emails`** (`subscriptionDisabledEmail`) — provides the locale-aware email template for the auto-disable notification.
- **`../audit`** (`webhooksAuditActions`) — enum value for the auto-disable audit event.
- **`../metrics`** (`webhookDeliveryAttemptsTotal`, `webhookSubscriptionsAutoDisabledTotal`) — Prometheus counters incremented on every outcome.
- **`../model`** (`WebhookDeliveryDocument`, `WebhookSubscriptionDocument`) — document shapes and the `leaseToken` contract.
- **`@modules/users`** (`userService.getById`) — resolves `ownerUserId` to an email address for the courtesy notification.
- **`@infrastructure/observability/audit`** (`emitAuditEvent`) — records the auto-disable as an audit trail entry.
- **`@infrastructure/adapters/mailer`** (`enqueueEmail`) — queues the owner notification email.
- **`@infrastructure/adapters/logger`** (`logger`) — logs the error path when owner lookup fails.
- **`@infrastructure/i18n`** (`getDefaultLocale`) — locale for the email template.
- **`../module.ts`** — registers `processDeliveryJob` as a queue consumer; that job is the primary caller of `attemptDelivery`.

## Notes

- **Lease-token race handling:** `applyOutcome` returns `null` if the token no longer matches (another worker re-claimed the row). The result is simply dropped — never retried. This is a design guarantee, not a bug.
- **Failure streak semantics:** A single failed attempt that still has retries left does **not** increment the subscription's consecutive-failure count. Only a fully exhausted chain (no backoff steps remaining) counts as a failure. This is intentional: "sustained failure" means the whole chain gave up.
- **`attemptDelivery` requires an already-claimed row.** Callers must have obtained the row via `claimPending` or `claimForReplay` so `leaseToken` is set. Passing an unclaimed row will throw in `requireLeaseToken`.
- **Subscription is caller-supplied, not re-fetched.** This is what allows `processDeliveryJob` (which fetched it to decide whether to send) and `replay` (which may load it differently) to share the same function without redundant I/O.
- **Auto-disable notification is fire-and-forget.** The audit entry is written unconditionally; the email is a courtesy. A failed `userService.getById` only costs the email, not the audit record. It is explicitly *not* the operator-facing alert (that is Alertmanager's responsibility).
- **Payload `timestamp` is `delivery.createdAt`, not `Date.now()`.** This keeps the timestamp identical across every retry of the same delivery, matching the Standard Webhooks spec documented in `asyncapi.yaml`.
