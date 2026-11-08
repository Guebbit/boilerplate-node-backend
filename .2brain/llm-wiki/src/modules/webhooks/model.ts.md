---
source: src/modules/webhooks/model.ts
sha256: ba7a4900a9a1494d357e1b914dacd60a03f07c1900de068a6bcd07552f87c196
generated_at: 2026-11-08T09:03:36.503241+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/model.ts

## Purpose

Defines the two Mongoose collections the webhooks module owns — `webhooksubscriptions` (a tenant's standing subscription to event types) and `webhookdeliveries` (one row per event × subscription, tracking retry state) — including their schemas, indexes, TypeScript interfaces, and the wire serialization transform for subscriptions.

## Key elements

- **`WebhookSubscriptionDocument` / `WebhookDeliveryDocument`** — Mongoose `Document` interfaces describing each collection's shape.
- **`webhookSubscriptionSchema`** — Schema with `tenant`, `url`, `eventTypes`, failure-tracking fields (`consecutiveFailures`, `failingSince`, `disabledAt`, `autoDisabledAt`), and a nested `secrets` sub-schema (`_id: false`, explicit `id` string). Two indexes: `(tenant, createdAt DESC)` and `(disabledAt, eventTypes)`.
- **`applyWebhookSubscriptionTransform`** — Serialization transform (via `applySerialization`) that strips `tenant`, `ownerUserId`, `failingSince`; collapses `secrets` into `secretIds` + `retiringSecrets`; derives `enabled` from `disabledAt`; deletes `secrets` before the row leaves the process.
- **`webhookSubscriptionModel`** — The registered Mongoose model (collection `webhooksubscriptions`).
- **`webhookDeliverySchema`** — Schema with `subscriptionId`, `eventId`, `eventType`, `payload`, `status` (enum from `WebhookDeliveryStatus`), `attempt`, `nextAttemptAt`, and lease fields (`leaseToken`, `leaseExpiresAt`). Six indexes covering idempotency, admin listing, status filtering, and sweep reads. A TTL index (`expireAfterSeconds`) derived from `DAY_SECONDS × retentionDays`.
- **`webhookDeliveryModel`** — The registered Mongoose model.
- **`WebhookSecretRingEntry`** — Interface for one entry in a subscription's secret ring (`id`, `ciphertext`, `createdAt`); ciphertext is the only persisted form.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — Provides `applySerialization`, the generic mechanism the subscription transform is built on (defines `omit`/`after` semantics and execution order).
- **`src/domain-primitives/time.ts`** — Supplies `DAY_SECONDS` for computing the delivery TTL index's `expireAfterSeconds`.
- **`src/modules/webhooks/config.ts`** — Supplies `getWebhookDeliveryRetentionDays()` read once at import time for that TTL value.
- **`src/modules/webhooks/secrets.ts`** — Supplies `liveRingEntries` and `retiringRingSecrets` used inside the subscription transform; `mintRingSecret` (same module) is what pre-mints the `id` that the schema's explicit `id` field stores.
- **`src/modules/webhooks/repository.ts`** — Sole writer of `failingSince`; performs `disable`, `claimPending`, `claimForReplay`, and `applyOutcome` (all operating on the shapes defined here).
- **`src/modules/webhooks/services/publish.ts`** — Fans out by querying enabled subscriptions (the `(disabledAt, eventTypes)` index) and creates delivery rows relying on the `(subscriptionId, eventId)` unique index for idempotency.
- **`src/modules/webhooks/services/sweep.ts`** — Reads due retryable rows via the `(status, nextAttemptAt)` index and stranded leases via the `(status, leaseExpiresAt)` index.
- **`src/modules/webhooks/services/attempt.ts`** — Reads a claimed delivery, signs the payload with a live secret, writes outcome fields (`responseCode`, `durationMs`, `error`, `status`, `nextAttemptAt`) back to the row.
- **`src/modules/webhooks/services/subscriptions.ts`** — CRUD layer that reads/writes subscription documents and invokes `mintRingSecret` before first save.
- **`src/modules/webhooks/services/reencrypt.ts`** — Reads `secrets` ciphertext, re-encrypts under a new key, writes back to the same sub-schema.
- **`src/modules/webhooks/presenters.ts`** — Alternative presentation path; the transform in this file exists because admin list reads use `.lean()` + `normalize` and never reach a presenter.
- **`src/modules/webhooks/index.ts`** — Re-exports the models and types for other modules.
- **`scenarios/webhooks.ts`** — Integration scenario exercising the full subscribe → publish → deliver → retry flow against these two collections.

## Notes

- **No `enabled` field exists.** Subscription enablement is the *absence* of `disabledAt`; the wire `enabled` boolean is derived in the serialization transform. This guarantees the stored state and the derived flag can never disagree.
- **`secrets` uses `_id: false` + explicit `id`.** `mintRingSecret` in `secrets.ts` generates the id via `randomUUID()` *before* the document is saved, so the CREATE response can reference it immediately. Declaring `id` as a real schema field (not a virtual) ensures it survives `.lean()` reads.
- **Serialization order matters.** `omit` runs before `after` (enforced by `applySerialization`). That is why `secrets` is read and deleted inside `after` rather than listed in `omit` — it must still be present to derive `secretIds`/`retiringSecrets`.
- **`in_flight` is a lease, not a simple state.** `leaseToken`/`leaseExpiresAt` are stamped atomically with the status change in `repository.ts`. A row whose lease has expired is claimable again (crash-recovery path). No `failed` status exists — per-attempt history is the design direction.
- **TTL index caveat.** Mongo cannot modify `expireAfterSeconds` in place; changing the retention env var and restarting requires a manual index drop/recreate (same pattern as `audit-logs` and `tasks`).
- **`failingSince` is the only writer-gated field** — exclusively written by `repository.ts#recordOutcome`. It is absent whenever `consecutiveFailures` is 0.
