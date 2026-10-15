---
source: src/modules/webhooks/model.ts
sha256: 2a4caea3f9970cf10311230c6f5bba84854d9760797365adba9c1fa227370532
generated_at: 2026-10-15T12:19:06.011382+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/model.ts

## Purpose

Defines the two Mongoose collections the webhooks module owns — `webhooksubscriptions` (a tenant's standing subscription to event types) and `webhookdeliveries` (one row per event × subscription, tracking the delivery lifecycle through retries) — including their schemas, indexes, TypeScript document interfaces, and wire-shape serialization transforms.

## Key elements

- **`WebhookSecretRingEntry`** — interface for one entry in a subscription's secret ring; only `ciphertext` is ever persisted.
- **`WebhookSubscriptionDocument` / `webhookSubscriptionSchema`** — the subscription schema with fields for tenant, url, eventTypes, enabled state, failure tracking (`consecutiveFailures`, `failingSince`, `disabledAt`), `ownerUserId`, and the embedded `secrets` array.
- **`WebhookSubscriptionModel` / `webhookSubscriptionModel`** — typed Mongoose model for the subscription collection.
- **`applyWebhookSubscriptionTransform`** — serialization middleware that strips internal fields (`tenant`, `ownerUserId`, `failingSince`) and collapses `secrets` to a `secretIds` array (live-ring ids only, via `liveRingEntries`).
- **`WebhookDeliveryDocument` / `webhookDeliverySchema`** — the delivery schema: tenant, subscriptionId, eventId, eventType, payload, attempt counter, `status` (enum from `WebhookDeliveryStatus`), response metrics, `nextAttemptAt`, and the lease pair (`leaseToken`, `leaseExpiresAt`).
- **`WebhookDeliveryModel`** — typed Mongoose model for the delivery collection.
- **Indexes** — subscription: `{tenant, createdAt}` and `{enabled, eventTypes}`. Delivery: unique `{subscriptionId, eventId}`, `{tenant, createdAt}`, `{subscriptionId, createdAt}`, `{status, createdAt}`, `{status, nextAttemptAt}`, `{status, leaseExpiresAt}`, and a TTL on `createdAt`.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, which both transforms call to build their `omit`/`after` pipeline.
- **`src/modules/webhooks/secrets.ts`** — provides `liveRingEntries`, used by the subscription transform to derive the public `secretIds` list.
- **`src/modules/webhooks/config.ts`** — provides `getWebhookDeliveryRetentionDays`, read at import time to size the TTL index.
- **`src/modules/webhooks/repository.ts`** — the sole writer of `failingSince`; also implements `claimPending`, `claimForReplay`, and `applyOutcome` which read/write the lease fields and status transitions.
- **`src/modules/webhooks/services/publish.ts`** — reads subscriptions via the `{enabled, eventTypes}` index for fan-out; relies on the unique `{subscriptionId, eventId}` index for idempotent enqueue.
- **`src/modules/webhooks/services/sweep.ts`** — reads due/stranded rows via the `{status, nextAttemptAt}` and `{status, leaseExpiresAt}` indexes.
- **`src/modules/webhooks/services/attempt.ts`** — resolves `ownerUserId` to an email at auto-disable notice time.
- **`src/modules/webhooks/presenters.ts`** — consumes the serialized wire shapes produced by the transforms.
- **`scenarios/webhooks.ts`** — integration scenario that exercises both collections end-to-end.
- **`src/modules/webhooks/tests/integration/delivery-log.test.ts`** — integration tests against the delivery collection.

## Notes

- **Secrets subdocument uses `_id: false` + explicit `id`**: the id is minted by `secrets.ts` via `randomUUID()` *before* the subscription is saved, so the CREATE response can reference it immediately. It is declared as a real schema field (not a virtual) so it survives `.lean()` reads.
- **Serialization ordering**: `secrets` is deleted inside `after` rather than listed in `omit` because `omit` runs before `after`; listing it in `omit` would remove it before the `after` callback could derive `secretIds`.
- **TTL index is immutable at runtime**: changing `NODE_WEBHOOK_DELIVERY_RETENTION_DAYS` and restarting will fail boot (Mongo cannot alter `expireAfterSeconds` in place). Run `npm run db:sync` to drop and rebuild the index.
- **`in-flight` is a lease, not a caller-set state**: only `repository.ts` transitions into it (paired with `leaseToken`/`leaseExpiresAt` in the same write). Workers and sweep must not set it directly.
- **No `failed` status**: a failed attempt with retries remaining reverts to `pending`; only `exhausted` is terminal. Per-attempt history is intentionally out of scope.
- **`tenant` field-name collision**: unrelated to `locales/model.ts`'s `tenant` (a translation keyspace); see `docs/theory/tenancy.md`.
- **`ownerUserId` is an id pointer, not an email copy** (GDPR Art. 5(1)(c)/(d)); the current email is resolved at send-time by `attempt.ts`.
