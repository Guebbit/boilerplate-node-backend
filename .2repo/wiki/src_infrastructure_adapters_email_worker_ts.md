# src/infrastructure/adapters/email.worker.ts

## Purpose

Consumer-side handler for queued email jobs. Renders an EJS template and sends the message over SMTP via the shared `nodemailer` helper. It is the worker counterpart to `enqueueEmail` in `adapters/mailer.ts`, invoked by `consumeFromQueue` when a message-broker is configured.

## Key elements

- **`EMAIL_QUEUE`** (re-export from `adapters/queue`) — the queue name constant, re-exported here so the worker registry can reference it from a single import site.
- **`handleEmailJob(job: Partial<EmailJob>): Promise<boolean>`** — the sole functional export. Validates that `job.request.to` and `job.templateName` are present; if either is missing it logs a warning and returns `false` (permanent refusal → dead-letter). Otherwise calls `nodemailer(request, templateName, data)` and returns `true` on success. On SMTP/transport failure it logs the error **and rethrows**, causing `consumeFromQueue` to requeue the job.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports the `EmailJob` type and the `nodemailer` transport function. This file is the consumer; mailer.ts is the producer (`enqueueEmail`).
- **`src/infrastructure/adapters/queue.ts`** — Source of the `EMAIL_QUEUE` constant re-exported here.
- **`src/infrastructure/adapters/logger.ts`** — Provides the `logger` used for warn (invalid payload) and error (send failure) messages.
- **`src/app/workers.ts`** — Worker registry that wires `handleEmailJob` to `EMAIL_QUEUE` when a broker is active.
- **`shared/contracts/asyncapi.workers.yaml`** — AsyncAPI contract describing this worker's queue, event names, and message schema.
- **`tests/unit/infrastructure/adapters/workers.test.ts`** — Unit tests covering the validation, success, and failure paths of `handleEmailJob`.

## Notes

- **Return-value semantics are load-bearing.** `false` signals a *permanent* refusal (the message is dead-lettered, not retried). Any thrown error signals a *transient* failure and triggers a requeue. Callers of `consumeFromQueue` depend on this distinction.
- **No locale/i18n logic here by design.** The producer resolves all strings before publishing; `job.data` is finished copy. Do not add locale branching to this file.
- **`Partial<EmailJob>` is intentional.** The broker delivers an opaque payload, so every field is treated as untrusted until the runtime check. The `eslint-disable` for `no-unnecessary-condition` documents this.
- **Logged-and-rethrown, not logged-and-swallowed.** The error log exists so a persistently failing job is visible in logs; the rethrow is what actually requeues it. Removing either half breaks the retry contract.
