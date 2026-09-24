---
source: src/modules/webhooks/services/attempt.ts
sha256: 08a28e4bd67c0a6b33279fa1f0c7f43c3a9bf8d6bc61e37911038cd7238bf940
generated_at: 2026-09-23T19:42:01.090658+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/attempt.ts

## Purpose

Implements the core webhook delivery attempt: signs the payload, performs the SSRF-guarded POST to the subscriber's URL, and records the outcome (succeeded / pending-retry / exhausted) on the delivery row and the subscription's consecutive-failure streak. Shared by the queued job processor (`processDeliveryJob`) and the synchronous admin replay path so both agree on what "recording an outcome" means.

## Key elements

- **`attemptDelivery`** _(exported)_ — Entry point. Takes an already-claimed `delivery` and a caller-supplied `subscription`; signs with active ring secrets, calls `deliverWebhook`, then delegates to `recordSuccess` or `recordFailure`. Returns `null` if the lease was lost mid-attempt.
- **`processDeliveryJob`** — Queue handler (registered via `../module.ts` `consumers` entry). Claims the named row, loads its subscription, and calls `deliverIfPossible` → `attemptDelivery`.
- **`recordSuccess`** — Marks the delivery `succeeded`, increments the success metric, resets the subscription's failure streak via `recordOutcome(id, true)`.
- **`recordFailure`** — If the backoff ladder still has a slot, leaves the row `pending` with an incremented attempt counter (no subscription write). If exhausted, marks the row `exhausted`, increments the failure streak, and calls `disable` + `notifyOwnerOfAutoDisable` when `shouldAutoDisable` triggers.
- **`finalizeUndeliverable`** — Terminal `exhausted` write when the subscription is missing, disabled, or has no active secret.
- **`notifyOwnerOfAutoDisable`** — Emits a system audit event, then fire-and-forgets a courtesy email to the subscription owner (resolved fresh via `userService.getById`). Logs on lookup failure; the audit entry is already recorded.
- **`requireLeaseToken`** — Runtime guard that throws if `delivery.leaseToken` is falsy, narrowing the optional type so `applyOutcome` receives a definite `string`.
- **`deliverIfPossible`** — Wrapper that calls `attemptDelivery` or `finalizeUndeliverable` depending on whether the subscription is `null`.

## Relationships

- **`../transport/webhook-delivery`** (`deliverWebhook`) — performs the actual signed HTTP POST; this file supplies the envelope, secrets, and SSRF exemption.
- **`../repository`** (`webhookDeliveryRepository`, `webhookSubscriptionRepository`) — all outcome writes (`applyOutcome`, `recordOutcome`, `disable`) go through these.
- **`../domain`** (`nextAttemptAt`, `shouldAutoDisable`) — backoff scheduling and auto-disable threshold logic.
- **`../secrets`** (`activeRingSecrets`) — filters the subscription's secret array to the active ring.
- **`../config`** (`getWebhookDemoAllowedHost`) — provides the dev/test SSRF exemption host.
- **`../emails`** (`subscriptionDisabledEmail`) — template for the auto-disable notification.
- **`../audit`** (`webhooksAuditActions`) — action constants for audit events.
- **`../metrics`** (`webhookDeliveryAttemptsTotal`, `webhookSubscriptionsAutoDisabledTotal`) — Prometheus counters incremented on each outcome.
- **`../model`** — `WebhookDeliveryDocument` / `WebhookSubscriptionDocument` type definitions.
- **`@infrastructure/adapters/mailer`** (`enqueueEmail`) — sends the owner notification email.
- **`@infrastructure/observability/audit`** (`emitAuditEvent`) — records the auto-disable audit entry.
- **`@infrastructure/adapters/logger`** — logs the failed owner-lookup error.
- **`@infrastructure/i18n`** (`getDefaultLocale`) — locale for the email template.
- **`@modules/users`** (`userService.getById`) — resolves the owner's current email address.
- **`../module.ts`** — registers `processDeliveryJob` on the queue consumers manifest.

## Notes

- `attemptDelivery` requires an **already-claimed** row. If `applyOutcome` returns `null`, the lease was lost (another worker re-claimed the row); the result is silently dropped — never retried.
- A single failed attempt with retries remaining does **not** increment the subscription's failure streak. Only a fully exhausted chain counts as one failure.
- The `timestamp` field in the Standard Webhooks envelope is `delivery.createdAt` (event time), not `Date.now()`, so it stays identical across retries of the same delivery.
- The subscription is **caller-supplied** (not re-fetched inside `attemptDelivery`). This is deliberate: `processDeliveryJob` already loaded it to decide whether there is anything to send, and `replay` loads it differently.
- `notifyOwnerOfAutoDisable` is strictly best-effort. The audit entry is written unconditionally; a failed user lookup only costs the email, not the record.
