---
source: src/modules/webhooks/model.ts
sha256: e19bff1708ded87b27c86ef4c0a8a716b3f917ddd5907ed99b0d30a683783064
generated_at: 2026-11-14T22:43:24.928538+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/model.ts

## Purpose

Defines the two Mongoose collections the webhooks module owns — `webhooksubscriptions` (a tenant's standing subscription to a slice of the event catalogue) and `webhookdeliveries` (one row per event × subscription, tracking attempts to success, exhaustion, or a never-notified subscriber). It declares the schemas, indexes, serialization transforms, and the `model()` entrypoints that every other file in the module reads and writes against.

## Key elements

- **`WebhookSecretRingEntry`** – Interface for one entry in a subscription's secret ring (`id`, `ciphertext`, `createdAt`). Plaintext never persists.
- **`WebhookSubscriptionDocument`** / **`WebhookSubscriptionModel`** – Document and model types for a subscription row. Notable fields: `eventTypes` (required, non-empty), `consecutiveFailures`, `failingSince`, `disabledAt`, `autoDisabledAt`, `ownerUserId`, `secrets`.
- **`webhookSubscriptionSchema`** – Mongoose schema with two compound indexes: `{tenant, createdAt:-1}` (tenant list) and `{disabledAt, eventTypes}` (publish fan-out). Applies `revisionPlugin` for ETag/If-Match.
- **`applyWebhookSubscriptionTransform`** – Serialization transform: omits `tenant`/`ownerUserId`/`failingSince`; in `after`, reads the `secrets` array, derives `secretIds` (live ring), `retiringSecrets`, and `enabled` (from absence of `disabledAt`), then deletes `secrets` from the wire shape.
- **`webhookSubscriptionModel`** – Mongoose model (`'WebhookSubscription'`), collection `webhooksubscriptions`.
- **`WebhookDeliveryDocument`** / **`WebhookDeliveryModel`** – Document and model types for a delivery row. Tracks `status` (`pending → in_flight → succeeded/exhausted`), `attempt`, `nextAttemptAt`, `leaseToken`, `leaseExpiresAt`, and outcome fields (`responseCode`, `durationMs`, `error`).
- **`webhookDeliverySchema`** – Mongoose schema with indexes: unique `{subscriptionId, eventId}` (idempotent fan-out), `{tenant, createdAt:-1}`, `{subscriptionId, createdAt:-1}`, `{status, createdAt:-1}`, `{status, nextAttemptAt}` (sweep read), and a stranded-in_flight read. Carries a TTL index keyed on `getWebhookDeliveryRetentionDays()`.

## Relationships

- **`src/modules/webhooks/secrets.ts`** – Provides `liveRingEntries` / `retiringRingSecrets` used inside the subscription transform; owns encryption at rest and ring rotation.
- **`src/modules/webhooks/config.ts`** – Supplies `getWebhookDeliveryRetentionDays()` for the delivery TTL index.
- **`src/infrastructure/persistence/revision-plugin.ts`** – Applied to the subscription schema to drive `ETag`/`If-Match` revision tracking.
- **`src/infrastructure/persistence/serialize.ts`** – `applySerialization` is the mechanism that wires the `omit`/`after` hooks on the subscription schema.
- **`src/domain-primitives/time.ts`** – Provides `DAY_SECONDS` used in the TTL calculation.
- **`src/modules/webhooks/repository.ts`** – The sole writer of `failingSince`, `disabledAt`, `autoDisabledAt`; implements `claimPending`/`claimForReplay` (lease acquisition) and `applyOutcome` (lease-guarded write).
- **`src/modules/webhooks/services/publish.ts`** – Uses the `{disabledAt, eventTypes}` index for fan-out; the unique `{subscriptionId, eventId}` index makes redelivered events idempotent.
- **`src/modules/webhooks/services/sweep.ts`** – Reads due `{status, nextAttemptAt}` rows and stranded `in_flight` rows whose lease expired.
- **`src/modules/webhooks/services/subscriptions.ts`**, **`src/modules/webhooks/services/attempt.ts`**, **`src/modules/webhooks/services/enqueue.ts`**, **`src/modules/webhooks/services/reencrypt.ts`**, **`src/modules/webhooks/services/actions.ts`** – All read/write through the models defined here.
- **`src/modules/webhooks/index.ts`** – Re-exports the module's public surface.

## Notes

- **No stored `enabled` flag.** Enabled state is the *absence* of `disabledAt`; the wire `enabled` boolean is derived in the transform. This guarantees the two can never disagree.
- **`secrets` uses `_id: false` + explicit `id`.** `secrets.ts#mintRingSecret` generates the UUID before the document is saved so the CREATE response can name the ring entry immediately. Declaring `id` as a real schema field (not a virtual) ensures it round-trips through `.lean()` reads.
- **Transform ordering gotcha.** `secrets` is read and deleted inside `after`, not listed in `omit`, because `applySerialization` runs `omit` before `after` — naming it in `omit` would make the field unavailable when `after` needs to derive `secretIds`/`retiringSecrets`.
- **`in_flight` is a leased claim, not a caller-set state.** `leaseToken` + `leaseExpiresAt` are stamped atomically with the status change. `applyOutcome` writes only while the caller's token still matches. Expired leases make the row claimable again (crash-recovery path).
- **No `failed` status exists.** Per-attempt failures live on the attempt side (matching Stripe/GitHub/Svix convention); only `exhausted` is terminal on the delivery row.
- **Retention is set at import time.** `getWebhookDeliveryRetentionDays()` is read once; the TTL index is created at startup and cannot change at runtime.
