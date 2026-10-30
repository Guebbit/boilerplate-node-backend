---
source: src/modules/webhooks/repository.ts
sha256: 1cb47a03937de5671e79fe3f5b510f13b4bf9dd852f8d715aeafcc53e9f30c73
generated_at: 2026-10-29T06:28:34.551921+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/repository.ts

## Purpose

Defines the data-access layer for the two webhook collections (subscriptions and deliveries). It wires the shared `createRepository` factory into both Mongoose models and then layers on the queries the generic factory cannot express: atomic claim/lease operations, failure-streak bookkeeping, tenant-scoped reads, and a full-collection enabled-subscription scan. It is the single place that talks to MongoDB for this module, so service files stay free of query logic.

## Key elements

- **`StoredWebhookSubscription`** — wire type for a subscription row with `actions` omitted (added later by `services/actions.ts`).
- **`webhookSubscriptionRepository`** — exported object combining base CRUD (`createRepository` output) with custom methods: `findEnabled`, `findEnabledIdsAmong`, `findByIdInTenant`, `recordOutcome`, `disable`, `forgetOwner`, and `reencrypt`.
- **`WEBHOOK_DELIVERY_SORT`** — canonical sort spec (`createdAt: -1, _id: -1`) used when listing deliveries newest-first.
- **`claimPending` / `claimForReplay`** — atomic `findOneAndUpdate` lease acquirers. `claimPending` only claims `pending` or expired-`in-flight` rows; `claimForReplay` also claims terminal-status rows (for admin re-send). Both set a fresh `leaseToken` + `leaseExpiresAt` (60 s).
- **`applyOutcome`** — writes an attempt's result patch to a delivery row, but only if the row's `leaseToken` still matches the caller's claim (prevents a superseded worker from clobbering a newer attempt).
- **`recordFailure` / `recordOutcome`** — failure path uses two separate atomic writes (first stamp `failingSince` if absent, then `$inc` the streak); success path resets both in one write.
- **`disable`** — conditionally sets `disabledAt` + `autoDisabledAt`, guarded by `disabledAt: null` so a concurrent operator pause is never overwritten.
- **`forgetOwner`** — `$unset`s `ownerUserId` across a user's subscriptions within a `ClientSession` transaction (GDPR erasure).

## Relationships

- **`./model.ts`** — supplies `webhookSubscriptionModel`, `webhookDeliveryModel`, their document types, and the `applyWebhook*Transform` functions passed to `createRepository`.
- **`@infrastructure/persistence/create-repository.ts`** — provides the `createRepository` factory, the `Repository` contract type, and the `toObjectId` helper used throughout.
- **`@infrastructure/persistence/changes.ts`** — provides `setAndUnset` (imported for building update operators).
- **`@infrastructure/security/reencrypt.ts`** — provides `reencryptOf` and the `ReencryptSpec`/`ReencryptReport` types bound into the subscription repository's `reencrypt` method.
- **`src/modules/webhooks/services/publish.ts`** — calls `findEnabled` to get the full enabled set for in-memory event matching.
- **`src/modules/webhooks/services/attempt.ts`** — sole caller of `applyOutcome`; reads `leaseToken` from the claimed row before writing.
- **`src/modules/webhooks/services/sweep.ts`** — calls `claimPending` to pick up stranded/queued deliveries.
- **`src/modules/webhooks/services/subscriptions.ts`** — calls `recordOutcome`, `disable`, `findByIdInTenant`, and the base CRUD.
- **`src/modules/webhooks/services/actions.ts`** — reads subscription rows via the repository, then attaches caller-specific `actions` before returning.
- **`src/modules/webhooks/services/deliveries.ts`** — uses `findEnabledIdsAmong` to batch-resolve which subscriptions are still enabled for a page of deliveries.
- **`src/modules/webhooks/services/reencrypt.ts`** — drives the `reencrypt` method exposed on the subscription repository.
- **`src/modules/webhooks/tests/contract/webhooks.test.ts`** — exercises the repository's public surface as part of contract tests.

## Notes

- The explicit `Repository<…> & { … }` annotation on `webhookSubscriptionRepository` is required (not stylistic): Mongoose's `Query` generics make TypeScript emit TS7056 at the export boundary if the type is left to inference.
- `recordFailure` deliberately runs the `failingSince` stamp **before** the `$inc`, and the returned document reflects the stamp because the second query's `returnDocument: 'after'` reads post-increment state.
- `findEnabled` is a full-collection scan (`disabledAt: null`) by design — the table is expected to stay small, and the matching logic (set-membership / wildcards) can't be expressed as a Mongo index predicate.
- `LEASE_DURATION_MS` (60 s) is intentionally well above the transport timeout (10 s) to cover DB round-trips and GC pauses, while staying short enough that the sweep's stranded-lease scan reclaims a truly dead worker promptly.
- `claimForReplay` differs from `claimPending` only in that its `$or` permits terminal statuses; both are the *only* places a delivery row's status legitimately transitions into `in-flight`.
