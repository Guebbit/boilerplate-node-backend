---
source: src/modules/webhooks/model.ts
sha256: 6dd22d1046d00a653d192b14ca205d00bf1f3655d4dc74b6f6b2f6e8a0285422
generated_at: 2026-10-29T06:27:36.986070+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/model.ts

## Purpose

Defines the two Mongoose schemas and models the webhooks module persists: **WebhookSubscription** (a tenant's standing subscription to a slice of the public event catalogue) and **WebhookDelivery** (one row per event × subscription, tracking attempts through to success, exhaustion, or a subscriber never told because the subscription was disabled first). Also exports the serialization transform that shapes subscription reads for the wire.

## Key elements

- **`WebhookSecretRingEntry`** — interface for one entry in a subscription's secret ring (`id`, `ciphertext`, `createdAt`). Ciphertext is the only form ever persisted.
- **`WebhookSubscriptionDocument` / `WebhookSubscriptionModel`** — typed document and model for the subscription collection. Notable fields: `disabledAt` (absent = enabled), `autoDisabledAt` (distinguishes auto-disable from manual), `failingSince` (start of current failure streak), `ownerUserId` (GDPR-minimal pointer), `secrets` (embedded array).
- **`webhookSubscriptionSchema`** — Mongoose schema with indexes on `{tenant, createdAt}` (list) and `{disabledAt, eventTypes}` (fan-out read). The `secrets` subdocument uses `_id: false` with an explicit `id` field so the id is knowable before the document is saved.
- **`applyWebhookSubscriptionTransform`** — built via `applySerialization`; hides `tenant`/`ownerUserId`/`failingSince`, collapses `secrets` into `secretIds` + `retiringSecrets`, derives `enabled` from `disabledAt`, then deletes `secrets` from the serialized output.
- **`webhookSubscriptionModel`** — the exported model entrypoint (collection `webhooksubscriptions`).
- **`WebhookDeliveryDocument` / `WebhookDeliveryModel`** — typed document and model for the delivery collection. Notable fields: `status` (enum from `@types`), `leaseToken` + `leaseExpiresAt` (SQS-style visibility-timeout lease for `in-flight`), `nextAttemptAt`, `attempt`.
- **`webhookDeliverySchema`** — Mongoose schema with a unique index on `{subscriptionId, eventId}` (idempotent fan-out), plus indexes for admin log queries and the retry sweep. Includes a TTL index driven by `getWebhookDeliveryRetentionDays()`.
- **`webhookDeliveryModel`** — the exported model entrypoint (collection `webhookdeliveries`).

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — supplies `applySerialization`, the helper that builds `applyWebhookSubscriptionTransform`.
- **`src/modules/webhooks/config.ts`** — supplies `getWebhookDeliveryRetentionDays()` for the delivery TTL index (read once at import).
- **`src/modules/webhooks/secrets.ts`** — supplies `liveRingEntries` and `retiringRingSecrets`, used inside the subscription transform to derive `secretIds` and `retiringSecrets`.
- **`src/modules/webhooks/repository.ts`** — primary consumer of both models; writes `failingSince`, `disabledAt`, `autoDisabledAt`, lease fields, and status transitions.
- **`src/modules/webhooks/services/publish.ts`** — fan-out read using the `{disabledAt, eventTypes}` index; writes new delivery rows.
- **`src/modules/webhooks/services/sweep.ts`** — reads due `pending` rows (`{status, nextAttemptAt}`) and stranded `in-flight` rows (`{status, leaseExpiresAt}`).
- **`src/modules/webhooks/services/enqueue.ts`** — creates delivery rows.
- **`src/modules/webhooks/services/attempt.ts`** — updates a delivery row's status, response, and next-attempt fields.
- **`src/modules/webhooks/services/reencrypt.ts`** — rewrites the `secrets` array in place.
- **`src/modules/webhooks/services/subscriptions.ts`** — CRUD on subscription documents.
- **`src/modules/webhooks/index.ts`** — re-exports the models and transform for external consumers.
- **`src/modules/webhooks/tests/integration/delivery-log.test.ts`** — integration tests exercising the delivery schema and indexes.

## Notes

- **No `enabled` boolean is stored.** Enabled state is derived from the absence of `disabledAt`. This guarantees the wire `enabled` flag and the stored state can never disagree.
- **`secrets` subdocument `_id: false` + explicit `id`.** The id is minted via `randomUUID()` in `secrets.ts#mintRingSecret` *before* the subscription is saved, so the CREATE response can name the entry. Declared as a real schema field (not a virtual) so it survives `.lean()` reads.
- **Transform reads `secrets` inside `after`, not `omit`.** `applySerialization` runs `omit` before `after`; naming `secrets` in `omit` would delete it before the `after` hook could derive `secretIds`/`retiringSecrets`.
- **TTL index boot caveat.** Mongo cannot modify `expireAfterSeconds` in place. Changing `NODE_WEBHOOK_DELIVERY_RETENTION_DAYS` and restarting will fail boot; `npm run db:sync` is required to apply the new value.
- **`in-flight` is a lease, not a caller-set state.** Only `repository.ts#claimPending` / `claimForReplay` write it, stamping `leaseToken` + `leaseExpiresAt` in the same write. The sweep never claims; it only publishes.
- **Unique index `{subscriptionId, eventId}`** makes redelivered-event fan-out idempotent at the DB level.
- **`failingSince` is written only by `repository.ts#recordOutcome`** and cleared on success. Absent when `consecutiveFailures` is 0.
