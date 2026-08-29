# src/infrastructure/adapters/email.worker.ts

## Purpose

Consumer handler for the email queue. It validates a job payload, renders a template, and dispatches the resulting email via the `nodemailer` adapter. It exists as the "worker side" of the producer/consumer split defined in `mailer.ts`, so the application can enqueue emails from any request context and deliver them asynchronously through the message broker.

## Key elements

- **`handleEmailJob(job: Partial<EmailJob>): Promise<boolean>`** — The sole exported handler. Validates that `job.request.to` and `job.templateName` are present (returns `false` on failure → permanent dead-letter). On success, calls `nodemailer(job.request, job.templateName, job.data ?? {})` and resolves `true`. On SMTP/network failure, logs the error **and rethrows** so the queue requeues the message.
- **`EMAIL_QUEUE`** — Re-exported from `@infrastructure/adapters/queue` so the worker registry can reference the queue name without importing the queue adapter directly.
- **`EmailJob`** (type re-export) — Re-exported from `@infrastructure/adapters/mailer` so callers of this queue see the payload contract in one place.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Provides both the `nodemailer` send function and the `EmailJob` type. This file is the consumer-side counterpart; `mailer.ts` owns the producer-side contract.
- **`src/infrastructure/adapters/queue.ts`** — Source of `EMAIL_QUEUE` and the generic `consumeFromQueue` runner that invokes `handleEmailJob`. The generic on `consumeFromQueue` is why the parameter here is `Partial<EmailJob>` rather than `unknown`.
- **`src/infrastructure/adapters/logger.ts`** — Used for the two log sites (warn on invalid payload, error on send failure).
- **`src/app/workers.ts`** — Worker registry that wires `EMAIL_QUEUE` → `handleEmailJob` into the running application.
- **`shared/contracts/asyncapi.workers.yaml`** — AsyncAPI contract that documents this worker's queue, channel, and message schema for external consumers.
- **`docs/tools/rabbitmq.md`** — Operational reference for the broker this worker connects to.
- **`tests/unit/infrastructure/adapters/workers.test.ts`** — Unit tests exercising `handleEmailJob` (valid path, invalid-payload path, error/rethrow path).

## Notes

- **Return-value contract is load-bearing.** `false` means *permanent* refusal (the job is structurally invalid); a thrown error means *transient* failure. The queue layer (`consumeFromQueue`) treats these differently: `false` → dead-letter, `throw` → requeue. Do not collapse them.
- **`Partial<EmailJob>` is intentional, not a shortcut.** The broker can deliver payloads published by an older producer version. The optional-chain guard (`job?.request?.to`) and the `job.data ?? {}` fallback both exist to tolerate missing fields without a separate type predicate.
- **No i18n / locale resolution here by design.** The producer is expected to have already resolved all user-facing strings into `job.data` before publishing. This worker only interpolates into a template and hands the result to SMTP.
- **Errors are logged *and* rethrown.** Removing the `logger.error` call would make repeated SMTP failures invisible (the queue would keep requeueing silently). Removing the `throw` would cause the message to be ack'd and lost.
