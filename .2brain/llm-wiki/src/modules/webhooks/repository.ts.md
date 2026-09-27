---
source: src/modules/webhooks/repository.ts
sha256: 7ff59a5804335a1099ebf5cf05bcde6ce8d23af4c0dd4bcaf18600539d3ad448
generated_at: 2026-09-27T15:43:05.086656+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/repository.ts

## Purpose

Data-access layer for the two webhook collections (`webhooksubscriptions`, `webhookdeliveries`). Extends the generic `createRepository` factory with domain-specific queries that have no generic shape: atomic lease-based claims, streak-tracking outcome writes, tenant-scoped lookups, and the sweep's due-row read.

## Key elements

- **`webhookSubscriptionRepository`** (exported) — base CRUD + `findEnabled`, `findByIdInTenant`, `recordOutcome`, `disable`.
- **`webhookDeliveryRepository`** (exported) — base CRUD + `claimPending`, `claimForReplay`, `applyOutcome`, `findDue`, `findByIdInTenant`.
- **`WEBHOOK_DELIVERY_SORT`** (exported) — `{ createdAt: -1, _id: -1 }` sort spec for delivery listings.
- **`findEnabled`** — collection scan for all `enabled: true` subscriptions; matched in-memory downstream (no index by design).
- **`findSubscriptionByIdInTenant` / `findDeliveryByIdInTenant`** — single-doc lookup narrowed to `tenant` in the query; wrong-tenant and unknown-id both return `null`.
- **`recordOutcome`** — success: one atomic write resetting `consecutiveFailures` and unsetting `failingSince`; failure: delegates to `recordFailure`.
- **`recordFailure`** (internal) — two sequential `findOneAndUpdate` calls: first stamps `failingSince` (conditional on `$exists: false`), then `$inc`s the streak. Order matters for the returned document.
- **`disable`** — conditional on `enabled: true` so a concurrent double-exhaust cannot overwrite `disabledAt`.
- **`claimPending`** — atomic `pending → in-flight` (or stranded `in-flight` with expired lease) transition with a fresh UUID lease token.
- **`claimForReplay`** — same lease mechanism but permits reclaiming rows at any terminal status; only blocked by a *live* lease.
- **`applyOutcome`** — writes an outcome patch guarded by `leaseToken` equality; returns `null` if the token no longer matches (caller must not retry).
- **`findDue`** — sweep's read: `pending` rows whose `nextAttemptAt` has passed, plus stranded `in-flight` rows, oldest first, capped by `limit`.
- **`lease()` / `LEASE_DURATION_MS`** (internal) — generates `{ leaseToken, leaseExpiresAt }`; duration is 60 s.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — supplies the `createRepository` factory, `toObjectId` helper, and the `Repository<TDocument, TWire>` type that both exports extend.
- **`src/modules/webhooks/model.ts`** — provides the Mongoose models (`webhookSubscriptionModel`, `webhookDeliveryModel`), document transforms, and document/wire type aliases used throughout.
- **`src/types/index.ts`** — source of the `WebhookSubscription` and `WebhookDelivery` wire types that appear in the exported repository signatures.
- **`src/modules/webhooks/services/attempt.ts`** — sole caller of `applyOutcome`; reads `leaseToken` off the claimed row and passes it here.
- **`src/modules/webhooks/services/subscriptions.ts`** — calls `findByIdInTenant`, `recordOutcome`, and `disable` on the subscription repository.
- **`src/modules/webhooks/services/sweep.ts`** — calls `findDue` to discover work; does *not* call `claimPending` itself (the worker does).
- **`src/modules/webhooks/services/publish.ts`** — calls `findEnabled` to select matching subscriptions, and `create` on the delivery repository.
- **Tests** (`contract/webhooks.test.ts`, `integration/delivery.test.ts`, `integration/subscriptions.test.ts`, `integration/sweep.test.ts`, `cross-cutting/webhook-event-producers.test.ts`, `scenarios/webhooks.ts`) — exercise the repositories through the service layer.

## Notes

- **Two-step failure write is intentional.** `recordFailure` issues two separate `findOneAndUpdate` calls (stamp `failingSince`, then `$inc` the streak) rather than a single aggregation-pipeline update. The `$exists: false` filter makes the "first failure" case atomic on its own; combining into one round-trip was rejected for clarity.
- **`findEnabled` is a deliberate collection scan.** No index on `enabled` — the table is expected to stay small (per-tenant cap), and downstream matching is set-membership/wildcard logic that an index cannot serve.
- **Explicit type annotations on both exports are load-bearing.** Mongoose's `Query` generics are wide enough that TypeScript raises TS7056 (unserializable inferred type) at the export boundary once the factory result is spread; naming the `Repository<…> & {…}` intersection fixes it.
- **`applyOutcome` must not be retried on `null`.** A `null` return means another worker already holds the lease; that new holder is solely responsible for the row's next state.
- **Lease duration (60 s) vs. delivery timeout (10 s).** The 50 s gap covers DB round-trips and GC pauses without letting a truly crashed worker strand a row long enough to matter before the sweep's `findDue` reclaims it.
