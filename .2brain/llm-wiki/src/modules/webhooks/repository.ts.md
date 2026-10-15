---
source: src/modules/webhooks/repository.ts
sha256: eed3a3cdd6d3172912c6e92074e61b10a5a670ea28c48ef7a0e8397b04c42c05
generated_at: 2026-10-15T12:20:07.655863+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/repository.ts

## Purpose

Defines the two MongoDB repositories (subscriptions and deliveries) for the webhook module, extending the shared generic factory with domain-specific atomic operations: queued/sweep claims, admin-replay claims, outcome recording, and the "find all enabled subscriptions" scan used during event fan-out.

## Key elements

- **`webhookSubscriptionRepository`** – Exported subscription repository. Spreads the factory CRUD, then adds `reencrypt`, `findEnabled`, `findByIdInTenant`, `recordOutcome`, and `disable`.
- **`findEnabled()`** – Returns every `enabled: true` subscription in one collection scan; callers (event fan-out) match in memory.
- **`findSubscriptionByIdInTenant(id, tenant)`** – Single-row lookup scoped to tenant; wrong-tenant and unknown ids are indistinguishable (both `null`).
- **`recordOutcome(subscriptionId, succeeded)`** – On success: resets `consecutiveFailures` to 0 and `$unset`s `failingSince` in one write. On failure: delegates to `recordFailure`, which stamps `failingSince` (only on first failure, via `$exists: false` guard) then `$inc`s the counter.
- **`disable(subscriptionId)`** – Conditionally sets `enabled: false` + `disabledAt`; the `enabled: true` filter prevents a race re-stamping the timestamp.
- **`WEBHOOK_DELIVERY_SORT`** – `{ createdAt: -1, _id: -1 }` – newest-first sort for delivery lists.
- **`findDeliveryByIdInTenant(id, tenant)`** – Delivery counterpart of the subscription lookup.
- **`claimPending(id)`** – Atomically (`findOneAndUpdate`) moves a `pending` or lease-expired `in-flight` row to `in-flight` under a fresh 60 s lease. Returns the claimed doc or `null`.
- **`claimForReplay(id)`** – Same lease mechanism but allows reclaiming any status (including `succeeded`/`exhausted`) as long as no live lease is held; used by the admin replay path.
- **`outcomeUpdate(patch)`** – Splits an `OutcomePatch` into a `$set` for present fields and a `$unset` for `undefined` ones, preventing stale values from a prior attempt from persisting.
- **`applyOutcome(id, leaseToken, patch)`** – Applies the outcome write **only** while the row's `leaseToken` still matches the caller's claim; a superseded claim's write is silently dropped. Sole mutation path that moves a delivery past `in-flight`.
- **`lease()` / `LEASE_DURATION_MS`** – Generates a `{ leaseToken: UUID, leaseExpiresAt: now + 60 s }` pair.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** – Supplies `createRepository`, `toObjectId`, and the `Repository<T, W>` type; both repositories are built by spreading the factory result.
- **`src/infrastructure/security/reencrypt.ts`** – Provides `reencryptOf`, which is attached as the `reencrypt` method on the subscription repository.
- **`src/modules/webhooks/model.ts`** – Source of the Mongoose models (`webhookSubscriptionModel`, `webhookDeliveryModel`), document types, and wire transforms used by both repositories.
- **`src/modules/webhooks/services/attempt.ts`** – Sole caller of `applyOutcome`; narrows the claimed doc's `leaseToken` before invoking it.
- **`src/modules/webhooks/services/sweep.ts`** – Consumes `claimPending` to pick up stranded `in-flight` rows whose lease has expired.
- **`src/modules/webhooks/services/deliveries.ts`** – Consumes delivery-repository methods (`findDeliveryByIdInTenant`, the factory list/search).
- **`src/modules/webhooks/services/subscriptions.ts`** – Consumes `findByIdInTenant`, `recordOutcome`, and `disable` on the subscription repository.
- **`src/modules/webhooks/services/publish.ts`** – Calls `findEnabled` to obtain the candidate subscription set for in-memory event filtering.
- **`src/modules/webhooks/metrics.ts`** – Referenced in the module's dependency graph; likely observes outcome/retry events emitted by the services above.
- **`src/modules/webhooks/tests/contract/webhooks.test.ts`** – Contract tests asserting the repository's public shape and behavior.
- **`src/modules/webhooks/tests/integration/*.test.ts`** – Integration tests exercising `claimPending`, `claimForReplay`, `applyOutcome`, `recordOutcome`, and `disable` against a real (or in-memory) Mongo instance.

## Notes

- The subscription repository export carries an **explicit type annotation** rather than relying on inference; Mongoose's large `Query` generics trigger TS7056 when the factory result is spread into a new object (see the `Repository` docblock in `create-repository.ts` for the rationale).
- `findEnabled` is intentionally a **collection scan**. The table is expected to stay small (per-tenant subscription caps act as the fan-out guard), and the in-memory match logic (set-membership / wildcards) cannot be expressed as a Mongo index query.
- `recordFailure` uses **two sequential writes** rather than a single aggregation-pipeline update: the `$exists: false` filter on `failingSince` makes the "first failure" stamp atomic on its own, avoiding the complexity of a compound pipeline while still being safe under concurrency.
- `outcomeUpdate` deliberately **`$unset`s** keys whose value is `undefined` so a succeeded retry doesn't leave the previous attempt's `error` (or vice-versa) on the document.
- `LEASE_DURATION_MS` (60 s) is intentionally well above the transport timeout (10 s) to cover DB round-trips and GC pauses, yet short enough that the sweep can reclaim a genuinely crashed worker's row within a minute.
- `applyOutcome` **never retries** a dropped write; ownership of the row has moved to whichever worker now holds the lease, and that worker is responsible for recording its own outcome.
