---
source: src/modules/webhooks/services/attempt.ts
sha256: e86f9acce62613e3a9d9e3dfc17ad2d61ba9f2481a123f3593757466311edae6
generated_at: 2026-11-08T09:05:49.484911+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/attempt.ts

## Purpose

The core delivery-attempt pipeline for webhooks: sign the payload, perform the HTTP POST (via `transport/webhook-delivery`), and record the outcome on both the delivery row and the subscription's failure streak. It exists as a single shared code path so that the queued worker (`processDeliveryJob`) and the synchronous admin `replay` (in `deliveries.ts`) cannot drift on what "recording an outcome" means.

## Key elements

- **`attemptDelivery`** (exported) — Signs and POSTs against the subscription's current URL/ring, then routes the result to `recordSuccess` or `recordFailure`. Requires an already-claimed delivery row (`leaseToken` set) and a non-null subscription.
- **`processDeliveryJob`** (exported) — Queue-job handler for `worker.webhook.deliver`. Claims the delivery row via `claimPending`, loads the subscription, and delegates to `deliverIfPossible`. Returns `true` (ack) when the row is settled or was already claimed by a sibling.
- **`recordSuccess`** (internal) — Marks the delivery `succeeded`, increments the success metric, and resets the subscription's failure streak via `recordOutcome(id, true)`.
- **`recordFailure`** (internal) — Increments the failure metric, computes `nextAttemptAt` from the backoff ladder. If a retry slot remains, the row stays `pending` with `attempt + 1`; otherwise delegates to `recordExhaustion`.
- **`recordExhaustion`** (internal) — Marks the delivery `exhausted`, increments the subscription's consecutive-failure counter, and auto-disables the subscription once `shouldAutoDisable` fires. Triggers `announceAutoDisable`.
- **`finalizeUndeliverable`** (internal) — Terminal write for deliveries whose subscription was deleted or disabled after the job was queued; no attempt is made.
- **`announceAutoDisable`** (internal) — Writes an audit entry (as the system actor) and emits the `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` domain event so the notifications module can page staff.
- **`requireLeaseToken`** (internal) — Narrows the optional `leaseToken` on `WebhookDeliveryDocument` to a required `string`; throws if the row was never claimed (unreachable in production).

## Relationships

- **`../repository.ts`** — Source of `webhookDeliveryRepository` (claim, `applyOutcome`) and `webhookSubscriptionRepository` (`findById`, `recordOutcome`, `disable`). All state writes in this file flow through these two objects.
- **`../secrets.ts`** — `activeRingSecrets` resolves which signing key(s) are currently valid for the subscription.
- **`../domain/` (`backoff.ts`)** — `nextAttemptAt` drives retry scheduling; `shouldAutoDisable` decides when the failure streak warrants auto-disabling.
- **`../events.ts`** — Provides the `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` event constant emitted to downstream listeners.
- **`../audit.ts`** — Provides `webhooksAuditActions` constants used in the audit record.
- **`../metrics.ts`** — `webhookDeliveryAttemptsTotal` and `webhookSubscriptionsAutoDisabledTotal` counters incremented on each outcome.
- **`@kernel/events` / `@kernel/permissions` / `@kernel/access/tenant`** — `emitDomainEvent` broadcasts the auto-disable event; `systemCallerContext` labels the audit entry as a background actor; `DEPLOYMENT_TENANT_ID` scopes the event's tenant.
- **`@infrastructure/observability/audit`** — `recordAudit` persists the auto-disable audit trail.
- **`./deliveries.ts`** — Contains `replay`, which also calls `attemptDelivery` with a synchronously-loaded subscription.
- **`../services/index.ts`** — Re-exports this module's public surface for the module manifest.
- **`notifications` (integration tests)** — `staff.test.ts` exercises the event → work-notice path triggered by `announceAutoDisable`.

## Notes

- **Lease-token discipline:** Every outcome write goes through `applyOutcome(id, leaseToken, …)`. If the token no longer matches (another worker re-claimed the row), `applyOutcome` returns `null` and the write is **dropped, never retried** — the new owner is responsible for its own outcome.
- **Failure-streak semantics:** A single failed attempt does **not** increment the subscription's consecutive-failure counter. Only an entirely exhausted retry chain (no backoff slots left) counts as one failure.
- **Payload `timestamp` is event time, not send time:** `delivery.createdAt` is used so the value is identical across every retry of the same delivery, letting subscribers deduplicate.
- **Auto-disable ≠ operator alert:** The domain event feeds the internal notifications module (staff work notice). Operator-facing paging is Alertmanager's responsibility via the queue-parked alert; this file deliberately does not emit that.
- **Caller-supplied subscription:** `attemptDelivery` accepts the subscription as a parameter rather than re-fetching it, so `replay` and `processDeliveryJob` can load it differently (synchronous lookup vs. already-fetched during claim) while sharing the same delivery logic.
