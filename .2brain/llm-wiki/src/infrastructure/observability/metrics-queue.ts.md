---
source: src/infrastructure/observability/metrics-queue.ts
source_sha256: 1a78dd06a0ea4765ca0551eadb64f761bbbefa1d6d5fd892839718377061e04d
context_sha256: a2ed416257bfc255f478505ded8767c00989e7d4c66ffe573b5f2cfcfcea6130
generated_at: 2026-11-22T02:59:56.656018+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/metrics-queue.ts

## Purpose
Defines the Prometheus metrics for the job queue: a counter for jobs parked in a dead-letter queue, and two gauges describing the durable fallback ("held jobs") queue. It exists because parked and held jobs are otherwise invisible. Nothing reads `<queue>.dead` on its own, and held jobs have no TTL, so only an alert reveals that nobody is draining them. All metrics register against the shared `metricsRegistry`.

## Key elements
- `queueJobsDeadLetteredTotal` — `Counter` of jobs parked in `<queue>.dead`. A job lands there after a permanent rejection (malformed, contract-invalid, handler-refused) or after a thrown error exhausted every retry. Any rate above zero is the alert (`QueueJobsParked`). Label cardinality is bounded because queue names come from `WORKER_CHANNELS`, not request data.
- `HeldJobsSummary` — interface `{ channel, count, oldestCreatedAt }`, one entry per channel that has a held job.
- `setHeldJobsReader(reader)` — registers the async function that supplies `HeldJobsSummary[]`. It is meant to be called once by the owner of the `jobs` collection.
- `queueHeldJobsGauge` — `Gauge` of how many jobs wait in the fallback queue, per `channel`. Channels with no held jobs are absent.
- `queueHeldJobsOldestAgeGauge` — `Gauge` of the age in seconds of the oldest held job, per `channel`, clamped to a minimum of 0. Above 15 minutes is the alert (`HeldJobsStuck`).
- Internal `withHeldJobs(apply)` — helper that both gauges' `collect()` hooks use. It calls the reader and applies the result.

## Relationships
- `src/infrastructure/observability/metrics-registry.ts` — supplies `metricsRegistry`, which every metric here registers against.
- `src/infrastructure/observability/metric-config.ts` — supplies `counterConfig` and `gaugeConfig`, which build each metric's definition from the generated `infrastructureMetricData`.
- `src/infrastructure/persistence/job-store.ts` — owns the `jobs` collection and is the intended caller of `setHeldJobsReader`. Observability sits below persistence, so the dependency is inverted through this setter rather than an import.
- `src/infrastructure/adapters/queue.ts` and `src/infrastructure/adapters/job-drain.ts`, along with the listed tests, are graph neighbors. This file does not import them, so the dead-letter counter is presumably incremented from the queue code. The file itself does not show that.

## Notes
- Both gauges compute their values lazily in `collect()` at scrape time and call `this.reset()` first, so stale channels disappear.
- `withHeldJobs` does nothing if no reader is set or `mongoose.connection.readyState` is not connected. Reader errors are swallowed. In either case the gauges are skipped rather than reported as zero, the same rule as the outbox gauge, so scrapes stay fast.
- Because the reader is injected, the held-jobs gauges report nothing until `setHeldJobsReader` has been called.
