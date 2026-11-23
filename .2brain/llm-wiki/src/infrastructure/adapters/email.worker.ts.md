---
source: src/infrastructure/adapters/email.worker.ts
source_sha256: 80a9a3d3a117676c3634e7926a7a37283283af1f9e298da23cc4bd43804a2998
context_sha256: 2707ab629fe95dd30643da3f536d5ecb148fb9b76b870f94194cf0dd9f93faa6
generated_at: 2026-11-22T02:36:05.830667+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/email.worker.ts

## Purpose
Queue consumer for email jobs: takes one queued job, renders its EJS template and sends it over SMTP via `sendTemplatedEmail`. It is the consumer counterpart to `enqueueEmail` in `src/infrastructure/adapters/mailer.ts` and is wired up by `consumeFromQueue` when a broker is configured. It does no locale handling, since the producer already resolved every string before publishing.

## Key elements
- `handleEmailJob(job: Partial<EmailJobPayload>): Promise<boolean>`: the job handler.
  - Treats the payload as untrusted, because it crossed a queue. If `request.to` or `templateName` is missing (or the job is null), it logs a warning, discards the job's spooled attachments and resolves `false`. `false` is a permanent refusal, so the job is dead-lettered.
  - Otherwise it calls `sendTemplatedEmail(job.request, job.templateName, job.data ?? {})`. On success it discards the attachments and resolves `true`.
  - If sending fails, it logs the error and rethrows without touching the attachments.
- `discardJobAttachments(attachments = [])`: private helper that calls `discardSpooled(key)` for every attachment and resolves `void`.
- `EMAIL_QUEUE`: re-exported from `src/infrastructure/adapters/queue.ts` so the worker registry can use it.

## Relationships
- `src/infrastructure/adapters/mailer.ts`: provides `sendTemplatedEmail`, which this file calls. The producer side, `enqueueEmail`, lives there too.
- `src/infrastructure/adapters/mail-spool.ts`: provides `discardSpooled`, used to delete spooled attachment files by `key`.
- `src/infrastructure/adapters/queue.ts`: the source of `EMAIL_QUEUE`. Its `consumeFromQueue` invokes this handler and retries rejections through a TTL retry queue.
- `src/infrastructure/adapters/logger.ts`: provides `logger`, used to warn on invalid payloads and to log send failures as errors.
- `src/types/index.ts`: supplies the `EmailJobPayload` type.
- `src/app/workers.ts`: the worker registry that uses this handler and `EMAIL_QUEUE`.
- `tests/unit/infrastructure/adapters/email.worker.test.ts`: the unit tests for this file.

## Notes
- Attachments are discarded only on final outcomes: a successful send or a permanent refusal. A rejected send keeps them so the retry attempts can still resolve the files.
- Any non-`false` failure, such as an SMTP fault, is left to reject. The error is logged and rethrown so that repeated failures stay visible while the TTL retry handles redelivery.
- The `eslint-disable` comments on the `job?.` checks are deliberate. A broker can deliver a null job, so the type is only a claim.
- The non-null assertion `job.request!` inside the `.then` closure is safe because the guard above has already checked it.
- Logging calls are marked `Stryker disable`, so they are excluded from mutation testing.
