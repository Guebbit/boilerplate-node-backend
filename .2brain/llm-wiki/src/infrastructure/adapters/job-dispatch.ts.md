---
source: src/infrastructure/adapters/job-dispatch.ts
source_sha256: cda9f9185d4a7b9e2e0981d0d071c4cb038e8d54c9619da360f2513bf87e961b
context_sha256: 2ab7730999514a942638f4aa34eb0aa4b8b6266064970eeeba6fda7c616576cb
generated_at: 2026-11-22T02:37:57.903784+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/job-dispatch.ts

## Purpose
Single entry point for producers handing off a background job. It publishes the job to the broker, or, when a broker is configured but unavailable, holds it in a durable fallback queue instead of dropping it or running it on the request thread. Previously a broker outage pushed mail sending, image decoding and whole-account exports back onto web request threads; this module exists to prevent that.

## Key elements
- `DispatchOutcome`: type `'published' | 'held' | 'inline'`, telling the caller where the job went.
  - `published`: the broker confirmed it.
  - `held`: the broker is down; the job was stored and a worker drains it from `jobs` (per the header, `src/infrastructure/adapters/job-drain.ts`).
  - `inline`: the caller must run the work itself.
- `dispatchJob<TPayload>(options: PublishOptions<TPayload>): Promise<DispatchOutcome>`: the only function. Its logic:
  1. Call `publishToQueue(options)`. If it returns truthy, resolve `'published'`.
  2. If `isQueueEnabled()` is false (no broker configured), resolve `'inline'`.
  3. Otherwise call `holdJob(options.queue, options.payload)`. Success resolves `'held'`. A rejection is logged with `logger.error` and resolves `'inline'`.

## Relationships
- `src/infrastructure/adapters/queue.ts`: supplies `publishToQueue`, `isQueueEnabled` and the `PublishOptions` type that `dispatchJob` accepts.
- `src/infrastructure/persistence/job-store.ts`: supplies `holdJob`, which writes the job to the durable fallback store.
- `src/infrastructure/adapters/logger.ts`: used to log a failure to hold a job.
- `src/infrastructure/adapters/image.worker.ts`, `src/infrastructure/adapters/mailer.ts` and `src/modules/account/services/export.ts`: listed as graph neighbors. The header names mail, image decoding and account export as the work that used to land on request threads. The file itself does not import them.
- `tests/unit/infrastructure/adapters/job-dispatch.test.ts`: unit tests for this module. `tests/unit/infrastructure/adapters/image.worker.test.ts` is also a neighbor.

## Notes
- `dispatchJob` never rejects as written. Hold failures are caught and become `'inline'`, so callers only need to branch on the outcome.
- `'inline'` has two different causes: no broker is configured, or the fallback store refused the job. Only the second case is logged.
- The payload must be JSON-serializable.
- The `Stryker disable` comment excludes the error-logging call from mutation testing.
