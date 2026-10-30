---
source: src/modules/webhooks/services/attempt.ts
sha256: e86f9acce62613e3a9d9e3dfc17ad2d61ba9f2481a123f3593757466311edae6
generated_at: 2026-10-29T06:29:44.491381+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/attempt.ts

## Purpose

Core delivery-attempt logic for webhooks: signs the payload, performs the HTTP POST (via `../transport/webhook-delivery`), then records the outcome on the delivery row and the subscription's consecutive-failure streak. Shared by the queued path (`processDeliveryJob`) and the synchronous admin replay path (`./deliveries.ts`) so both cannot drift on what "recording an outcome" means.

## Key elements

- **`attemptDelivery`** (exported) — Signs and POSTs against the caller-supplied subscription's URL and active secret ring, then routes to `recordSuccess`, `recordFailure`, or `finalizeUndeliverable`. Requires an already-claimed row (`leaseToken` set); returns `null` if the lease was lost mid-attempt.
- **`processDeliveryJob`** (exported) — Queue-job handler for `worker.webhook.deliver`. Claims the delivery row, loads the subscription, delegates to `deliverIfPossible`. Returns `true` (ack) when settled or already claimed by a sibling.
- **`recordSuccess`** — Applies `succeeded` outcome, resets the subscription's failure streak via `recordOutcome(subscriptionId, true)`.
- **`recordFailure`** — Increments `webhookDeliveryAttemptsTotal` (failure), computes the next backoff slot via `nextAttemptAt`. If a retry remains, leaves the row `pending` for the sweep; otherwise delegates to `recordExhaustion`.
- **`recordExhaustion`** — Marks the chain `exhausted`, counts the failure against the subscription streak, and auto-disables the subscription when `shouldAutoDisable` fires.
- **`finalizeUndeliverable`** — Terminal write for missing/disabled subscriptions: status `exhausted`, no attempt data.
- **`announceAutoDisable`** — Records an audit entry (as `systemCallerContext`) and emits `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` domain event. No-op if nothing was actually disabled.
- **`requireLeaseToken`** — Narrows the optional `leaseToken` to a required `string`; throws if called on an unclaimed row (unreachable in production).
- **`deliverIfPossible`** — Wrapper that handles a `null` subscription by calling `finalizeUndeliverable`.

## Relationships

- **`../repository.ts`** — Primary data access: `claimPending` / `claimForReplay` (row acquisition), `applyOutcome` (all outcome writes, lease-gated), `recordOutcome` (subscription streak), `disable`, `findById`.
- **`../transport/webhook-delivery.ts`** — `deliverWebhook` performs the actual signed HTTP POST; this file only orchestrates around it.
- **`../secrets.ts`** — `activeRingSecrets` resolves which signing keys are currently valid.
- **`../domain/index.ts`** — `nextAttemptAt` (backoff schedule) and `shouldAutoDisable` (streak threshold) drive retry/disable decisions.
- **`../events.ts`** — `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` constant emitted on auto-disable.
- **`../audit.ts`** — `webhooksAuditActions` enum values for the audit record.
- **`../metrics.ts`** — `webhookDeliveryAttemptsTotal` and `webhookSubscriptionsAutoDisabledTotal` counters.
- **`../model.ts`** — `WebhookDeliveryDocument` / `WebhookSubscriptionDocument` type definitions.
- **`@kernel/events.ts`** — `emitDomainEvent` transports the auto-disable event to subscribers.
- **`@kernel/permissions.ts`** — `systemCallerContext` provides the audit actor identity.
- **`@kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` scoped to the event.
- **`@infrastructure/observability/audit.ts`** — `recordAudit` writes the audit trail.
- **`./deliveries.ts`** — Importing caller: `replay` calls `attemptDelivery` for synchronous admin re-sends.
- **`./sweep.ts`** — Downstream consumer: picks up `pending` rows left by `recordFailure` for the next retry tick.
- **`../module.ts`** (referenced in docs) — Declares `processDeliveryJob` on the `consumers` manifest; deleting the module stops the queue.

## Notes

- **Lease is one-shot per write.** Every `applyOutcome` call is gated on the lease token still matching. A lost race returns `null` and is *dropped*, never retried — the new claimant owns the row.
- **A single failed attempt does not touch the subscription streak.** Only a fully *exhausted* chain (all backoff slots consumed) increments `consecutiveFailures`. This is a deliberate reading of "sustained failure."
- **`timestamp` in the payload is `delivery.createdAt`**, not `Date.now()`, so it is identical across every retry of the same delivery (Standard Webhooks envelope contract).
- **Auto-disable is audited before the domain event is emitted.** The audit entry is the record; the event (→ notifications) is the courtesy. If the event fails, the audit still landed.
- **`recordFailure` leaves status `pending`** (not a new status) so the sweep worker or a future fast-retry mechanism can pick it up without schema changes.
- **`requireLeaseToken` throws** rather than silently passing `undefined` — a defensive guard against calling `applyOutcome` on a never-claimed row, which would be an upstream bug.
