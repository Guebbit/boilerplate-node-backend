---
source: src/modules/webhooks/services/attempt.ts
sha256: 192dde4194872a9541faafd4fef43453866783dbf7cbb770e0cdbf34c305bc76
generated_at: 2026-11-14T22:45:43.390300+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/attempt.ts

## Purpose
Core delivery-attempt logic for webhooks: signs the payload, performs the HTTP POST, and records the outcome (success, retry-scheduled failure, or exhausted chain) on the delivery row and the parent subscription's failure streak. Shared by the queued worker path (`processDeliveryJob`) and the admin synchronous replay path (`deliveries.ts`) so that "what recording an outcome means" cannot drift between the two.

## Key elements
- **`attemptDelivery`** *(exported)* — Takes an already-claimed `WebhookDeliveryDocument` and its subscription. Validates the subscription is still enabled, the event still matches the filter, and an active signing secret exists. Calls `deliverWebhook` (transport layer) and routes the result to `recordSuccess` or `recordFailure`. Returns the settled row or `null` if the lease was lost mid-attempt.
- **`processDeliveryJob`** *(exported, truncated in source)* — Queue-consumer handler registered via the module's `consumers` manifest. Claims the named delivery row, loads the subscription, and delegates to `deliverIfPossible` → `attemptDelivery`.
- **`deliverIfPossible`** — Thin wrapper that tolerates a `null` subscription (deleted since queueing) by calling `finalizeUndeliverable`.
- **`recordFailure`** — Increments the failure metric. If `nextAttemptAt` yields a retry slot, writes the row back as `pending` with an incremented attempt counter. Otherwise delegates to `recordExhaustion`. Deliberately does **not** touch the subscription's streak for a non-terminal failure.
- **`recordExhaustion`** — Writes the row as `exhausted`, then calls `webhookSubscriptionRepository.recordOutcome(id, false)` to increment the consecutive-failure streak. If `shouldAutoDisable` is satisfied, disables the subscription, bumps the auto-disable metric, and calls `announceAutoDisable`.
- **`recordSuccess`** — Increments the success metric, writes the row as `succeeded`, and resets the subscription's failure streak via `recordOutcome(id, true)`.
- **`finalizeUndeliverable`** — Terminal write for deliveries that cannot be attempted (subscription deleted, disabled, filter mismatch, no active secret). Sets status `exhausted` with no response code or duration.
- **`announceAutoDisable`** — Writes an audit entry (as the system actor) and emits the `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` domain event so the notifications module can notify staff. No-op when the subscription was already gone.
- **`requireLeaseToken`** — Narrows `delivery.leaseToken` from `string | undefined` to `string`, throwing if absent. Lets `applyOutcome` demand a real token rather than silently matching an unclaimed row.

## Relationships
- **`src/modules/webhooks/repository.ts`** — All row and subscription state writes go through `webhookDeliveryRepository.applyOutcome` and `webhookSubscriptionRepository.recordOutcome` / `.disable`. The lease-token CAS in `applyOutcome` is the concurrency guard.
- **`src/modules/webhooks/domain/backoff.ts`** — Provides `nextAttemptAt` for retry scheduling.
- **`src/modules/webhooks/domain/event-filter.ts`** — Provides `matchesEventFilter` for the post-queue filter re-check.
- **`src/modules/webhooks/domain/index.ts`** — Barrel export through which `nextAttemptAt`, `matchesEventFilter`, and `shouldAutoDisable` are imported.
- **`src/modules/webhooks/secrets.ts`** — `activeRingSecrets` selects the valid signing keys before the HTTP call.
- **`src/modules/webhooks/events.ts`** — Exports the `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` constant consumed by `announceAutoDisable`.
- **`src/modules/webhooks/metrics.ts`** — `webhookDeliveryAttemptsTotal` (per-attempt gauge) and `webhookSubscriptionsAutoDisabledTotal` (auto-disable counter) are incremented inline.
- **`src/modules/webhooks/audit.ts`** — Supplies `webhooksAuditActions.SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` for the audit entry.
- **`src/modules/webhooks/model.ts`** — Defines `WebhookDeliveryDocument` and `WebhookSubscriptionDocument`; documents the `leaseToken` contract.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` is the actual audit-write call.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` scopes the domain event.
- **`src/kernel/events.ts`** — `emitDomainEvent` publishes the auto-disable event downstream (notifications).
- **`src/kernel/permissions.ts`** — `systemCallerContext` builds the actor context for the audit entry (background job, not a user).
- **`src/modules/webhooks/services/deliveries.ts`** — The replay path calls `attemptDelivery` directly, making this the single source of truth for outcome recording.
- **`src/modules/notifications/tests/integration/staff.test.ts`** — Integration-tests the staff-notification flow triggered by the `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` event emitted here.

## Notes
- **Already-claimed invariant.** Every code path that reaches `applyOutcome` must hold a row with `leaseToken` set (from `claimPending` or `claimForReplay`). `requireLeaseToken` enforces this at the type level; a missing token is treated as a programming bug, not a recoverable state.
- **Lost-lease semantics.** If `applyOutcome` returns `null` (a sibling re-claimed the row), the outcome is silently dropped. There is no retry of the write itself — the other claimant owns the row now.
- **Streak counting is chain-granular.** A single failed HTTP attempt (with retries remaining) does **not** increment `consecutiveFailures`. Only an exhausted retry chain (via `recordExhaustion`) does. This is an intentional reading of "sustained failure."
- **Payload timestamp is stable across retries.** `timestamp` in the Standard Webhooks envelope is `delivery.createdAt` (when the event originally occurred), not `Date.now()`, so every retry of the same delivery carries an identical timestamp.
- **Auto-disable audit is unconditional; the notification is best-effort.** The audit entry is written synchronously before the domain event is emitted. A notification failure does not roll back or suppress the audit trail.
- **Not an operator alert.** `announceAutoDisable` is explicitly *not* the Alertmanager-facing `QueueJobsParked` alert; it targets staff via the notifications module for a different audience.
