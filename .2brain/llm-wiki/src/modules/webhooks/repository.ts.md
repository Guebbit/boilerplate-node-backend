---
source: src/modules/webhooks/repository.ts
sha256: e50aee67a48d424e40e1d131c0d7c88f792e77fe3ee687899dbc864871fadb2d
generated_at: 2026-09-23T19:41:21.037407+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/repository.ts

## Purpose

Repository layer for the two webhook MongoDB collections (subscriptions and deliveries). Wraps the generic `createRepository` factory with domain-specific atomic operations—lease-based claiming, streak recording, conditional disable, and sweep reads—that the shapeless factory cannot express on its own.

## Key elements

- **`webhookSubscriptionRepository`** (export) — Base CRUD from the factory plus:
    - `findEnabled()` — returns every subscription with `enabled: true`; called once per published event for in-memory event-type matching.
    - `recordOutcome(subscriptionId, succeeded)` — On success: single atomic `$set`/`$unset` to reset the streak. On failure: two sequential writes (stamp `failingSince` only-if-absent, then `$inc` `consecutiveFailures`).
    - `disable(subscriptionId)` — Conditionally flips `enabled` to `false` and stamps `disabledAt`; the `enabled: true` filter prevents a duplicate finalizer from overwriting the timestamp.
- **`webhookDeliveryRepository`** (export) — Base CRUD (with `searchable` fields) plus:
    - `claimPending(id)` — Atomically claims a `pending` row or a stranded `in-flight` row whose lease has expired; sets `in-flight` + fresh lease. Returns the row or `null`.
    - `claimForReplay(id)` — Same exclusive-lease mechanism but also permits claiming rows at a terminal status (`succeeded`, `exhausted`); used by the admin replay path.
    - `applyOutcome(id, leaseToken, patch)` — Writes an outcome patch only while the caller's `leaseToken` still matches; a superseded claim's write is silently dropped.
    - `findDue(limit)` — Sweep read: all `pending` rows whose `nextAttemptAt` has passed, plus stranded `in-flight` rows with expired leases, oldest first, capped at `limit`.
- **`WEBHOOK_DELIVERY_SORT`** (export) — `{ createdAt: -1, _id: -1 }` sort spec for listing deliveries newest-first.
- **`lease()`** (internal) — Generates `{ leaseToken: randomUUID(), leaseExpiresAt: now + 60s }`.
- **`LEASE_DURATION_MS`** (internal) — 60 000 ms; intentionally well above the 10 s transport timeout to tolerate a DB round-trip or GC pause without stranding a live attempt.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — Supplies the `createRepository` factory (base CRUD), `toObjectId` helper, and the `Repository<TDocument, TWire>` type contract that both exported repositories spread and extend.
- **`src/modules/webhooks/model.ts`** — Provides the Mongoose models (`webhookSubscriptionModel`, `webhookDeliveryModel`), document-to-wire transforms, and the `WebhookSubscriptionDocument` / `WebhookDeliveryDocument` type aliases used throughout this file.
- **`src/modules/webhooks/services/attempt.ts`** — The sole caller of `claimPending` and `applyOutcome`; the only place a delivery's status legitimately moves past `in-flight`.
- **`src/modules/webhooks/services/sweep.ts`** — Consumes `findDue` to build its queue-publish batch (publishes without claiming; the worker's own `claimPending` enforces exclusivity).
- **`src/modules/webhooks/services/publish.ts`** — Calls `findEnabled` to retrieve the subscription set that an event must be matched against.
- **`src/modules/webhooks/services/subscriptions.ts`** — Uses the subscription repository's CRUD and `disable` / `recordOutcome`.
- **`src/modules/webhooks/tests/integration/*`** and **`tests/cross-cutting/webhook-event-producers.test.ts`** — Integration and cross-cutting tests that exercise the delivery, subscription, and sweep paths through these repositories.

## Notes

- The explicit `Repository<…> & { … }` annotations on both exports are required, not stylistic: TypeScript raises TS7056 when it tries to serialize the inferred type of a spread of the factory result without a named target type.
- `recordFailure` deliberately uses two sequential `findOneAndUpdate` calls instead of a single aggregation-pipeline update; the `failingSince: { $exists: false }` filter makes the "first failure" stamp atomic on its own.
- `claimForReplay` vs. `claimPending`: the only semantic difference is the filter—replay allows any status except a _live_ `in-flight`, whereas the queued/sweep path only accepts `pending` or _expired_ `in-flight`.
- `findDue` is a pure read; it does not claim. A row it returns may already be mid-attempt by the time the queue consumer picks it up, but that is safe because the consumer's own `claimPending` is the gate that decides who performs the HTTP attempt.
- The subscription repository intentionally has no `searchable` configuration—the admin list view applies no server-side filters.
