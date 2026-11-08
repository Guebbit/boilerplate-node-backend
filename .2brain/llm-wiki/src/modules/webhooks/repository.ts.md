---
source: src/modules/webhooks/repository.ts
sha256: e5b2037e527f0342c510603411d221ad17eb18ae8c6aa0651b9d07559e768317
generated_at: 2026-11-08T09:04:35.951076+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/repository.ts

## Purpose

Data-access layer for the two webhook collections (subscriptions and deliveries). Wraps the shared `createRepository` factory with domain-specific queries the generic factory has no shape for: atomic lease-based claims, tenant-scoped reads, failure-streak bookkeeping, and the enabled-subscription scan that drives event dispatch.

## Key elements

- **`StoredWebhookSubscription`** — wire type for a subscription row minus `actions` (those are added later by `services/actions.ts`).
- **`subscriptionBase` / `deliveryBase`** — standard CRUD from `createRepository`, with `searchable` declarations (presence/sort filters for subscriptions; objectId/exact filters for deliveries).
- **`findEnabled()`** — collection-scan `find({ disabledAt: null })`; read once per published event, matched in memory downstream.
- **`findEnabledIdsAmong(ids)`** — single `$in` read returning a `Set` of enabled ids among a page of deliveries.
- **`findByIdInTenant(id, tenant)`** — subscription or delivery by id, narrowed to tenant in the query; wrong-tenant and unknown ids are indistinguishable (`null`).
- **`recordOutcome(subscriptionId, succeeded)`** — success: one `$set`/`$unset` write resets the streak. Failure: delegates to `recordFailure`.
- **`recordFailure(subscriptionId)`** — two sequential `findOneAndUpdate` calls: first stamps `failingSince` only if absent (atomic "first" via `$exists: false`), then `$inc`'s `consecutiveFailures`.
- **`disable(subscriptionId)`** — conditionally sets `disabledAt` + `autoDisabledAt`, guarded on `disabledAt: null` so it can't overwrite a real operator pause.
- **`forgetOwner(userId, session)`** — `$unset`s `ownerUserId` across all rows for one account; participates in the erasure transaction via `ClientSession`.
- **`webhookSubscriptionRepository`** — the exported composite: `reencrypt` (from `reencryptOf`) + `subscriptionBase` spread + the custom queries above.
- **`WEBHOOK_DELIVERY_SORT`** — `{ createdAt: -1, _id: -1 }`, newest-first with `_id` tiebreak.
- **`claimPending(id)`** — atomic `findOneAndUpdate` transitioning `pending` → `in_flight` or reclaiming an expired-lease `in_flight` row; sets a fresh lease (token + 1-min expiry).
- **`claimForReplay(id)`** — same lease mechanism but allows claiming rows at *any* status except a live `in_flight` lease; powers admin re-send of already-terminal deliveries.
- **`applyOutcome`** (truncated) — patches a delivery row only while the caller's `leaseToken` still matches, preventing a superseded claim from clobbering a newer attempt.

## Relationships

- **`src/modules/webhooks/model.ts`** — supplies the Mongoose models, apply-transforms, and document types this file operates on.
- **`src/infrastructure/persistence/create-repository.ts`** — generic factory consumed to build `subscriptionBase` and `deliveryBase`.
- **`src/infrastructure/persistence/changes.ts`** — provides `setAndUnset` (imported for use in `applyOutcome`'s patch logic).
- **`src/domain-primitives/time.ts`** — provides `MINUTE_MS`, the basis of `LEASE_DURATION_MS`.
- **`src/infrastructure/security/reencrypt.ts`** — provides `reencryptOf` wired into the subscription repository's `reencrypt` method.
- **`src/modules/webhooks/services/attempt.ts`** — sole caller of `applyOutcome`; holds the `leaseToken` it returns from `claimPending`/`claimForReplay`.
- **`src/modules/webhooks/services/subscriptions.ts`** — calls `findByIdInTenant`, `recordOutcome`, `disable`.
- **`src/modules/webhooks/services/publish.ts`** — reads `findEnabled` to select matching subscriptions per event.
- **`src/modules/webhooks/services/actions.ts`** — augments stored rows with `actions` after the read (hence `StoredWebhookSubscription` omits them).
- **`src/modules/webhooks/services/reencrypt.ts`** — invokes the repository's `reencrypt` method.
- **`scenarios/webhooks.ts`** — integration/scenario tests exercising these repositories end-to-end.

## Notes

- The explicit type annotation on `webhookSubscriptionRepository` is load-bearing: spreading `subscriptionBase` into the object literal makes TypeScript emit TS7056 (unrepresentable inferred type). Naming the `Repository<TDocument, TWire>` contract silences it.
- `recordFailure` intentionally uses **two** writes rather than a single aggregation-pipeline update. The `$exists: false` filter on the first write is what makes the "first failure" stamp atomic without a compound operation.
- `findEnabled` is a deliberate collection scan — no index is created on the matched field because set-membership / wildcard matching can't leverage one, and the table is expected to stay small (per-tenant subscription cap).
- `LEASE_DURATION_MS` (60 s) is chosen to sit well above the 10 s transport timeout while still letting the sweep's stranded-lease read reclaim a genuinely dead worker within a minute.
- `claimPending` and `claimForReplay` share the lease mechanism but differ in their status guards: the former refuses terminal rows; the latter only refuses a *live* `in_flight` lease, so it can re-send `succeeded` or `exhausted` deliveries.
