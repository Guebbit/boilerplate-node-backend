---
source: src/modules/webhooks/model.ts
sha256: 93254fac6aa0dd6785bf3826c031e85664edc8e2dd4d9bd15ab22fd31a7bd04f
generated_at: 2026-09-23T19:40:31.233755+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/model.ts

## Purpose

Defines the two Mongoose collections the webhooks module owns — `webhooksubscriptions` (a tenant's standing subscription to event types) and `webhookdeliveries` (one row per event×subscription, tracking retry attempts through to success or exhaustion) — including their schemas, interfaces, index definitions, and serialization transforms for the HTTP wire shape.

## Key elements

- **`WebhookSecretRingEntry`** — interface for a single secret in a subscription's ring (id, ciphertext, createdAt). Only ciphertext is persisted; plaintext lives transiently in memory.
- **`WebhookSubscriptionDocument` / `WebhookSubscriptionModel`** — the subscription schema type. Tracks tenant, url, eventTypes, enabled state, failure streak (`consecutiveFailures` + `failingSince`), `ownerUserId`, and the `secrets` array.
- **`webhookSubscriptionSchema`** — Mongoose schema with two compound indexes: `{ tenant, createdAt desc }` and `{ enabled, eventTypes }`. Secrets sub-document uses `_id: false` with an explicit `id` field so `secrets.ts#mintRingSecret` can name entries before the parent document is saved.
- **`applyWebhookSubscriptionTransform`** — serialization: omits `tenant`, `ownerUserId`, `failingSince`; collapses `secrets` to `secretIds` (ids only, never ciphertext) via the `after` hook.
- **`webhookSubscriptionModel`** — Mongoose model instance, collection `webhooksubscriptions`.
- **`WebhookDeliveryDocument` / `WebhookDeliveryModel`** — the delivery schema type. Tracks status (`pending → in-flight → succeeded/exhausted`), attempt count, response details, `nextAttemptAt`, and the lease pair (`leaseToken` / `leaseExpiresAt`).
- **`webhookDeliverySchema`** — Mongoose schema with five indexes: admin-log filters (tenant, subscription, status — all with `createdAt desc`), the sweep's due-row read (`status + nextAttemptAt`), the sweep's stranded-lease read (`status + leaseExpiresAt`), and a TTL index on `createdAt`.
- **`deliveryRetentionDays`** — read once at import from `NODE_WEBHOOK_DELIVERY_RETENTION_DAYS` (default 30 days) to set the TTL.
- **`applyWebhookDeliveryTransform`** — serialization: omits `tenant`, `payload`, `leaseToken`, `leaseExpiresAt`.
- **`webhookDeliveryModel`** — Mongoose model instance, collection `webhookdeliveries`.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, the helper used to build both wire-shape transforms.
- **`src/infrastructure/runtime/environment.ts`** — provides `environmentNumber`, used to read the TTL retention setting at import time.
- **`src/modules/webhooks/secrets.ts`** — owns encryption-at-rest and rotation of the `ciphertext` values stored in the subscription's `secrets` array; mints the `id` field before the subscription is persisted.
- **`src/modules/webhooks/repository.ts`** — sole writer of `failingSince`; performs `claimPending` / `claimForReplay` (stamping `leaseToken` + `leaseExpiresAt`) and `applyOutcome` (guarded by token match).
- **`src/modules/webhooks/services/attempt.ts`** — resolves `ownerUserId` to an email at send time for auto-disable notices; writes delivery outcomes.
- **`src/modules/webhooks/services/publish.ts`** — queries the `{ enabled: 1, eventTypes: 1 }` index to fan out a new event to matching subscriptions.
- **`src/modules/webhooks/services/sweep.ts`** — reads the `{ status, nextAttemptAt }` and `{ status, leaseExpiresAt }` indexes to find due and stranded deliveries.
- **`src/modules/webhooks/index.ts`** — barrel re-export for the module's public API.

## Notes

- **TTL index is immutable at runtime.** Changing `NODE_WEBHOOK_DELIVERY_RETENTION_DAYS` and restarting will fail boot because Mongo cannot modify `expireAfterSeconds` in place. `npm run db:sync` must be run to drop and rebuild the index.
- **`secrets.id` is a real schema field, not a virtual.** This is deliberate so `.lean()` reads (which never apply virtuals) still expose it. The `_id: false` on the sub-document plus the explicit `id` field lets `mintRingSecret` return the id in the CREATE response before the parent document exists.
- **`failingSince` is absent (not `null`) when `consecutiveFailures` is 0.** Code checking for an active streak should test for the field's presence, not for a non-null value.
- **No `failed` delivery status exists by design.** A failed attempt with retries remaining reverts to `pending` with a later `nextAttemptAt`; only `exhausted` is terminal. Per-attempt history (if added later) would carry its own outcome enum.
- **`in-flight` is a leased claim, not a caller-set state.** `repository.ts` stamps it atomically with `leaseToken`/`leaseExpiresAt`; the sweep never claims, it only publishes.
- **`tenant` here is the organisation identifier**, unrelated to `locales/model.ts`'s same-named field (a translation keyspace).
