---
source: src/modules/webhooks/model.ts
sha256: 160ec97dc2140dabaeaaf082da61547a6d72150af12fae83272e93439476c591
generated_at: 2026-09-27T15:42:08.602989+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/model.ts

## Purpose

Defines the two Mongoose collections the webhooks module owns — `webhooksubscriptions` and `webhookdeliveries` — including their schemas, document interfaces, indexes, TTL, and the serialization transforms that shape API responses. Every other file in the webhooks module reads or writes through the models exported here.

## Key elements

- **`WebhookSecretRingEntry`** — interface for one entry in a subscription's secret ring (`id`, `ciphertext`, `createdAt`). Ciphertext is the only persisted form.
- **`WebhookSubscriptionDocument` / `WebhookSubscriptionModel`** — document and model types for the subscription collection. Tracks `tenant`, `url`, `eventTypes`, `enabled`, failure streak (`consecutiveFailures`, `failingSince`, `disabledAt`), `ownerUserId`, and the `secrets` ring.
- **`webhookSubscriptionSchema`** — Mongoose schema. Notable: `secrets` sub-document uses `_id: false` with an explicit `id` field so `secrets.ts#mintRingSecret` can name the entry before the row is saved. Two indexes: `{tenant, createdAt}` and `{enabled, eventTypes}`.
- **`applyWebhookSubscriptionTransform`** — serialization: omits `tenant`, `ownerUserId`, `failingSince`; in its `after` hook collapses `secrets` to `secretIds` (ids only, never ciphertext).
- **`webhookSubscriptionModel`** — the exported Mongoose model for collection `webhooksubscriptions`.
- **`WebhookDeliveryDocument` / `WebhookDeliveryModel`** — document and model types for per-event delivery rows. Tracks `status` (from `@types` `WebhookDeliveryStatus`), `attempt`, `nextAttemptAt`, and the lease pair (`leaseToken`, `leaseExpiresAt`).
- **`webhookDeliverySchema`** — Mongoose schema with `subscriptionId` as an `ObjectId` ref. Five indexes (tenant+created, subscription+created, status+created, status+nextAttemptAt, status+leaseExpiresAt) plus a TTL index on `createdAt`.
- **`deliveryRetentionDays`** — read via `environmentNumber('NODE_WEBHOOK_DELIVERY_RETENTION_DAYS', 30, 1)` at import time; feeds the TTL `expireAfterSeconds`.
- **`applyWebhookDeliveryTransform`** — serialization: omits `tenant`, `payload`, `leaseToken`, `leaseExpiresAt`.
- **`webhookDeliveryModel`** — the exported Mongoose model for collection `webhookdeliveries`.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, which both `applyWebhookSubscriptionTransform` and `applyWebhookDeliveryTransform` wrap. The `omit`/`after` ordering is an invariant this file relies on (see Notes).
- **`src/infrastructure/runtime/environment.ts`** — provides `environmentNumber`, used to read the delivery-retention env var at import time.
- **`src/modules/webhooks/secrets.ts`** — `mintRingSecret` mints the `id` (`randomUUID()`) before the subscription is saved; this file's schema (`_id: false` + explicit `id`) exists to make that possible. Encryption/rotation logic lives in `secrets.ts`; only ciphertext is stored here.
- **`src/modules/webhooks/repository.ts`** — sole writer of `failingSince` (`recordOutcome`); performs the lease-based claiming (`claimPending`, `claimForReplay`) and conditional `applyOutcome` writes that the lease fields on the delivery schema support.
- **`src/modules/webhooks/services/publish.ts`** — queries subscriptions via the `{enabled, eventTypes}` index to find which subscriptions want a given event.
- **`src/modules/webhooks/services/attempt.ts`** — resolves `ownerUserId` to an email at notice-send time for the auto-disable path.
- **`src/modules/webhooks/services/enqueue.ts`** — creates `WebhookDelivery` rows (initial `pending` status) when an event is published.
- **`src/modules/webhooks/services/deliveries.ts`** / **`subscriptions.ts`** — read/write the two models for their respective API surfaces.
- **`src/modules/webhooks/index.ts`** — module barrel; re-exports the models and transforms.
- **Tests** (`schema-contract.test.ts`, `secrets.test.ts`, `delivery.test.ts`, `sweep.test.ts`) — assert schema shape, serialization output, and lease/claim behavior against these definitions.

## Notes

- **`secrets` sub-document id strategy:** `_id: false` is set on the sub-schema and a real `id: String` field is declared so the id round-trips through `.lean()` reads (where Mongoose virtuals are absent). Do not switch this back to an auto-generated `_id` without breaking the pre-save naming in `secrets.ts`.
- **Serialization ordering:** `omit` runs *before* `after` in `applySerialization`. That is why `secrets` is read and deleted inside the `after` callback rather than listed in `omit` — naming it in `omit` would make it unavailable to the derivation.
- **TTL index is not hot-swappable:** Mongo will not modify `expireAfterSeconds` in place. Changing `NODE_WEBHOOK_DELIVERY_RETENTION_DAYS` and restarting the process will fail boot. Use `npm run db:sync` to drop and rebuild the index.
- **No `failed` delivery status:** By design, a failed attempt that still has retries left goes back to `pending`; only `exhausted` is terminal. Per-attempt outcomes are (currently) not stored as a sub-collection — the `attempt` number and top-level `responseCode`/`error` fields are the record.
- **`tenant` on subscriptions is not the same `tenant` as `locales/model.ts`** — they share a name and nothing else (see `docs/theory/tenancy.md`).
- **`ownerUserId` is a pointer, not a copy:** GDPR minimisation (Art. 5(1)(c)/(d)). The current email is resolved at send time in `attempt.ts`. Absent on legacy rows or stranger-created subscriptions; in either case no auto-disable notice is sent, but the audit entry is still written.
