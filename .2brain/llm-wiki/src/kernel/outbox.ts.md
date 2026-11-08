---
source: src/kernel/outbox.ts
sha256: e6c5cd8b7178b39280a9087d46f36db9ce4b842f8ff3960727a5089108007b9b
generated_at: 2026-11-08T03:54:30.695738+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/outbox.ts

## Purpose

Transactional outbox for durable domain events. An event row is written to MongoDB in the **same transaction** as the state change it announces, then published later by a relay process. This guarantees that a committed state change cannot lose its corresponding event, in contrast to the in-process bus in `./events` which offers no durability.

## Key elements

- **`OutboxStatus`** — union of `'pending' | 'published' | 'dead'`; `dead` is terminal and requires operator intervention.
- **`OutboxEventDocument`** / **`outboxEventSchema`** — Mongoose model (collection `outboxevents`). Carries `name`, `payload`, `aggregateId`, `status`, `attempts`, `nextAttemptAt`, `lockedUntil`, `lastError`, `publishedAt`. Two indexes: `{ status, createdAt, _id }` for relay reads and a TTL on `publishedAt` for cleanup.
- **`outboxEventModel`** — the Mongoose model export; the single entry point for all outbox reads/writes.
- **`OUTBOX_EVENT_DEAD`** (`'outbox.event_dead'`) — constant for the in-process event emitted when a row is parked as dead. Declared via module augmentation on `DomainEventMap`.
- **`enqueueOutboxEvent(name, payload, aggregateId, session)`** — writes one outbox row. The `session` param is **required**; the row is invisible to the relay until the caller's transaction commits.
- **`outboxBackoffMs(failedAttempts)`** — exponential backoff (5 s → 10 s → 20 s …, capped at 1 h). No jitter (per-aggregate claiming prevents thundering herds).
- **`RelayResult`** — `{ published, retried, dead }` summary of one relay sweep.
- **Internal relay functions** (not exported): `findHeads` (aggregation that returns each aggregate's oldest due, unclaimed pending row), `claim` (atomic lease via `findOneAndUpdate`), `dispatch` (forwards to the in-process bus via `emitDomainEvent`, never rejects), `markPublished`, `markFailed` (reschedules with backoff or parks as `dead`), `relayOne` (composes claim → dispatch → settle).

## Relationships

- **`src/kernel/events.ts`** — imports `emitDomainEvent`, `DomainEventMap`, `DomainEventName`; augments `DomainEventMap` with `'outbox.event_dead'`. The relay's `dispatch` step publishes into this bus.
- **`src/kernel/config.ts`** — reads `NODE_OUTBOX_RETENTION_DAYS`, `NODE_OUTBOX_MAX_ATTEMPTS`, `NODE_OUTBOX_LEASE_SECONDS` via `outboxConfig()`.
- **`src/infrastructure/observability/metrics-outbox.ts`** — increments `outboxEventsPublishedTotal`, `outboxEventsRetriedTotal`, `outboxEventsDeadTotal`; registers `setOutboxPendingReader`.
- **`src/infrastructure/runtime/database.ts`** — imports `withTransaction`; the outbox row write participates in the caller's Mongo transaction.
- **`src/infrastructure/adapters/logger.ts`** — logs the `dead` parking event at `error` level.
- **`src/domain-primitives/time.ts`** — uses `DAY_SECONDS` to compute the TTL index expiry.
- **`src/modules/account/services/*`** (password, profile, revocation, two-factor-enrollment, export-job) — call `enqueueOutboxEvent` inside their own `withTransaction` blocks to make their state changes durable.
- **`src/app/jobs.ts`** — presumably schedules the periodic `sweep:outbox` relay pass (the backstop alongside the post-commit nudge).
- **`scripts/ops/reapply-erasures.ts`** — operational script that likely interacts with or resets outbox rows.
- **`src/modules/account/tests/integration/consent-withdrawal.test.ts`** — integration test verifying outbox rows are written alongside state changes.

## Notes

- **At-least-once delivery.** A crash between dispatch and `markPublished` re-dispatches the row. Consumers that must be idempotent (money, stock, webhooks) should dedupe on `meta.eventId` (the row's `_id`).
- **Per-aggregate ordering.** `findHeads` picks the head *before* filtering on `nextAttemptAt`/`lockedUntil`, so a head waiting in backoff correctly blocks its aggregate's later rows. A dead row, however, never blocks.
- **Lease expiry is the crash-recovery mechanism.** `lockedUntil` is checked against `now` on claim; a crashed relay simply stops holding the lease. The lease duration must exceed the longest expected dispatch or a slow dispatch will be duplicated.
- **`outbox.event_dead` is emitted via the in-process bus, not the outbox itself.** An outbox row about the outbox could itself die and recurse. It carries no notification channel; administrators are alerted out-of-band.
- **TTL index + config change pitfall.** Changing `NODE_OUTBOX_RETENTION_DAYS` and restarting will fail boot until `npm run db:sync` rebuilds the index.
- **Mongoose quirk.** `create` accepts `{ session }` only in its array form (`create([doc], { session })`), hence the `[{ … }]` shape in `enqueueOutboxEvent`.
- **`outbox.generated`** — `outboxRuleData` (backoff base/cap) comes from a generated file, not hand-edited.
