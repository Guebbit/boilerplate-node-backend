---
source: src/infrastructure/adapters/job-drain.ts
source_sha256: 0ce91e70edb72261a91d3cfd6a96278688efba221920cc89af83fb95269d28af
context_sha256: 6d05054cc8ad16e95483434a4a8abfce1441a35114f34da7722ff60a041fd543
generated_at: 2026-11-22T02:38:19.418026+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/job-drain.ts

## Purpose
The worker-side half of the durable fallback queue. It runs polling loops that claim held jobs from the `jobs` store and execute them with the same handler and schema the broker's consumer uses, so a held job and a broker-delivered job end the same way. It also runs consumers' `fallbackSweep` hooks while the broker is down.

## Key elements
- `DrainConsumer` (interface): what the drain needs from a consumer.
  - `queue`: the channel name.
  - `handler(message)`: returns `true` when done, returns `false` to park the job, throws for a transient failure.
  - `schema`: the Zod contract a held payload must still satisfy.
  - `fallbackSweep?`: optional hook that sends work from the work's own durable rows (for example webhook deliveries).
- `startJobDrain(consumers, role)`: starts the loops.
  - It is idempotent.
  - It filters consumers with `isServedBy(role, queue)` and does nothing if none match.
  - It starts one loop for the urgent channel (`WORKER_CHANNELS.EMAIL_URGENT`) and one shared loop for all other served channels.
  - Only the shared loop receives the `fallbackSweep`s.
- `stopJobDrain(timeoutMs)`: sets the stop flag, clears pending timers, and waits up to `timeoutMs` (via `settleWithin`) for in-flight turns.
- `loop` / `turn` (internal): each turn runs the sweeps if due, then claims and runs at most one job. After a job was found the next turn is scheduled at 0 ms. When idle it is scheduled after `IDLE_POLL_MS` (5 s).
- `takeOne`: calls `claimNextJob(channels, CLAIM_LEASE_MS)` and looks up the consumer. If none exists for the channel, it parks the job.
- `runJob`: validates the payload with the schema (parks on failure), then runs the handler under `renewWhile`.
  - On `true` it calls `completeJob`.
  - On `false` it parks the job.
  - On a throw it retries via `retryJobLater`, or parks once `attempts + 1 >= NODE_QUEUE_MAX_ATTEMPTS`.
- `renewWhile`: renews the job lease every `CLAIM_LEASE_MS / 3` while the handler runs, so long jobs are not claimed twice. A crashed worker stops renewing and the lease lapses.
- `park`: increments `queue_jobs_dead_lettered_total`, logs a warning, and calls `parkJob`.
- `sweepIfDown` (inside `loop`): runs the sweeps with `Promise.allSettled` when `queueState() === 'unavailable'`, at most once per `FALLBACK_SWEEP_EVERY_MS` (15 s). Rejections are logged.

## Relationships
- `src/infrastructure/persistence/job-store.ts`: supplies `claimNextJob`, `completeJob`, `parkJob`, `retryJobLater`, `renewJobLease`, `CLAIM_LEASE_MS` and the `JobDocument` type.
- `src/infrastructure/adapters/queue.ts`: `queueState()` decides whether the broker is down and the sweeps should run.
- `src/infrastructure/adapters/config.ts`: `queueConfig()` provides `NODE_QUEUE_MAX_ATTEMPTS` and `NODE_QUEUE_RETRY_DELAY_SECONDS`.
- `src/infrastructure/adapters/job-kinds.ts`: `isServedBy(role, queue)` selects which channels this process serves.
- `src/infrastructure/runtime/config.ts`: provides the `WorkerRole` type.
- `src/infrastructure/runtime/settle.ts`: `settleWithin` bounds the wait in `stopJobDrain`.
- `src/infrastructure/observability/metrics-queue.ts`: provides the `queueJobsDeadLetteredTotal` counter.
- `src/infrastructure/adapters/logger.ts`: provides the logger.
- `src/types/index.ts`: provides `WORKER_CHANNELS`.
- `src/app/workers.ts` and `src/infrastructure/runtime/server-lifecycle.ts`: presumably the callers of `startJobDrain` and `stopJobDrain`. Their code is not shown here.
- `tests/integration/job-drain.test.ts`: integration tests for this module.

## Notes
- The loops use module-level state (`stopped`, `timers`, `turnsInFlight`), so there is one drain per process.
- Each loop processes one job at a time. This is intentional, because the drain is the rare path and does not use broker-style prefetch.
- The urgent loop gets no sweeps, so ordinary-job backlogs never delay urgent mail.
- Retry and park limits reuse the broker consumers' config values.
- All timers are `unref()`'d, so they never keep the process alive.
- The `takeOne` comment says a missing consumer can only be a stale row, and the code parks that job.
