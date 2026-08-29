# src/app/workers.ts

## Purpose

Assembly point that registers all RabbitMQ queue consumers at app startup. It is the single place where the application decides *which* queues this build drains, wiring them to infrastructure-level handlers. No-ops cleanly when the queue is disabled.

## Key elements

- **`registerWorkers`** (export) — Guards on `isQueueEnabled()`; if enabled, calls `consumeFromQueue` for both `EMAIL_QUEUE` (prefetch 5) and `PDF_QUEUE` (prefetch 2) in parallel via `Promise.all`. Logs start/finish through `logger`.

## Relationships

- **`src/app.ts`** — Calls `registerWorkers` once during startup.
- **`src/infrastructure/adapters/queue.ts`** — Supplies `consumeFromQueue` and `isQueueEnabled`, which this file delegates to.
- **`src/infrastructure/adapters/email.worker.ts`** — Exports `EMAIL_QUEUE` and `handleEmailJob`, consumed here.
- **`src/infrastructure/adapters/pdf.worker.ts`** — Exports `PDF_QUEUE` and `handlePdfJob`, consumed here.
- **`src/infrastructure/adapters/logger.ts`** — Provides the `logger` used for startup logging.
- **`docs/tools/rabbitmq.md`** — Referenced in the file's doc comment for operational RabbitMQ details.

## Notes

- **`PDF_QUEUE` has no producer.** The invoice endpoint renders PDFs synchronously on the request path. The consumer is registered deliberately as a working example of the async queue pattern.
- Prefetch values differ by workload (email 5 vs. PDF 2); adjust only if concurrency needs change.
- The file is classified as *app* (assembly) while its handlers live in *infrastructure* — the distinction is that choosing which queues to drain is a build-level decision, not a reusable adapter concern.
