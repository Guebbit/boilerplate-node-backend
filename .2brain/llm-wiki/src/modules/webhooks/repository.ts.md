---
source: src/modules/webhooks/repository.ts
sha256: b7f2102c829d2b1f60e2685428eb1cacebf1b4c0011c5b293fcd21b18382dcde
generated_at: 2026-11-14T22:44:41.584757+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/repository.ts

## Purpose

Provides the Mongo data-access layer for both webhook collections (subscriptions and deliveries). Beyond the generic CRUD from the shared `createRepository` factory, it defines the domain-specific queries that have no generic shape: atomic lease-based claims (`claimPending`, `claimForReplay`), failure-streak bookkeeping, tenant-scoped lookups, batch enabled-id checks, and the auto-disable guard.

## Key elements

- **`StoredWebhookSubscription`** — `Omit<WebhookSubscription, 'actions'>`; the wire shape for subscription rows (actions are added later by `services/actions.ts`).
- **`subscriptionBase`** — CRUD from `createRepository` scoped to `webhooksubscriptions`, with searchable filters (`disabled`, `autoDisabled`) and sortables (`createdAt`, `url`).
- **`findEnabled()`** — full-collection scan returning all rows where `disabledAt` is null; matched in-memory by `domain/event-filter.ts`.
- **`findEnabledIdsAmong(ids)`** — single `$in` query returning the subset of given ids that are still enabled; used to batch-resolve a page of deliveries.
- **`findSubscriptionByIdInTenant(id, tenant)`** — tenant-scoped single lookup; wrong-tenant and unknown ids both yield `null`.
- **`recordFailure(subscriptionId)`** — two-step atomic write: sets `failingSince` (guarded by `$exists: false`) then `$inc`s `consecutiveFailures`; both with `timestamps: false`.
- **`recordOutcome(subscriptionId, succeeded)`** — success path resets streak in one `$set`/`$unset`; delegates to `recordFailure` on failure.
- **`forgetOwner(userId, session)`** — `$unset`s `ownerUserId` on all rows owned by the given account, joined to the erasure transaction via `ClientSession`.
- **`disable(subscriptionId)`** — conditionally stamps `disabledAt` + `autoDisabledAt` (guarded by `disabledAt: null`) for the over-threshold auto-disable guard.
- **`webhookSubscriptionRepository`** — the primary export; merges `reencryptOf`, `subscriptionBase`, and all custom queries into a single object with an explicit `Repository<…> & { … }` annotation (required to silence TS7056).
- **`deliveryBase`** — CRUD for `webhookdeliveries` with searchable fields (`subscription`, `status`, `eventType`).
- **`WEBHOOK_DELIVERY_SORT`** — `{ createdAt: -1, _id: -1 }` for stable newest-first ordering.
- **`findDeliveryByIdInTenant(id, tenant)`** — tenant-scoped single delivery lookup.
- **`claimPending(id)`** — atomic `findOneAndUpdate` that transitions a row from `pending` (or expired `in_flight`) to a fresh `in_flight` lease; the queued/sweep claim path.
- **`claimForReplay(id)`** — same lease mechanism but allows claiming from *any* status except a live `in_flight`; the admin-replay claim path.
- **`applyOutcome`** (truncated) — writes an `OutcomePatch` (status, attempt, responseCode, durationMs, error, nextAttemptAt) back to a delivery row.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — provides the `createRepository` factory, `toObjectId` helper, and the `Repository` type that shapes both `subscriptionBase` and `deliveryBase`.
- **`src/infrastructure/persistence/changes.ts`** — supplies `setAndUnset`, imported for use in the generic CRUD layer.
- **`src/infrastructure/security/reencrypt.ts`** — this file imports `reencryptOf`, `ReencryptSpec`, and `ReencryptReport` from that module; `reencryptOf(webhookSubscriptionModel)` is spread into the `webhookSubscriptionRepository` export.
- **`src/domain-primitives/time.ts`** — `MINUTE_MS` sets `LEASE_DURATION_MS` (the lease window for claims).
- **`src/modules/webhooks/model.ts`** — provides both Mongoose models, their transform functions, and the document types used throughout.
- **`src/modules/webhooks/services/actions.ts`** — referenced in the `StoredWebhookSubscription` docblock: it adds `actions` to a row after the repository read.
- **`src/modules/webhooks/services/subscriptions.ts`** — referenced in the `findSubscriptionByIdInTenant` docblock: it cannot distinguish wrong-tenant from unknown ids.

## Notes

- **`timestamps: false` everywhere on bookkeeping writes.** Delivery/streak updates must not bump `updatedAt` because an open admin form's `If-Match` header compares against it.
- **`recordFailure` is intentionally two writes, not one.** The `failingSince: { $exists: false }` filter makes the "first failure" stamp atomic without an aggregation pipeline. Order matters: the `$set` runs before the `$inc` so the returned document already carries `failingSince`.
- **`findEnabled` is a deliberate collection scan.** The subscription table is expected to stay small (tenant-level cap acts as fan-out guard), and the matching logic (set-membership / wildcard) cannot be served by a Mongo index anyway.
- **`claimPending` vs `claimForReplay` differ in one `$or` clause.** Pending refuses terminal statuses; replay allows them. Both refuse a row under a *live* lease.
- **`LEASE_DURATION_MS = 60 s`** is deliberately ~6× the 10 s transport timeout (`transport/webhook-delivery.ts#DEFAULT_TIMEOUT_MS`), giving slack for a GC pause without stranding a crashed worker's row for a long sweep interval.
- **Explicit type annotation on `webhookSubscriptionRepository`.** Spreading the factory result into the object literal makes TS infer a shape it can't serialize at the export boundary (TS7056); the named `Repository<TDocument, TWire> & { … }` annotation is the fix.
