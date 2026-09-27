---
source: src/infrastructure/adapters/email.worker.ts
sha256: c8efc02a28ba573bbd26c0c9622126ca9ec93d38cb29bfd8961f1863e604d97d
generated_at: 2026-09-27T14:05:25.706470+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/email.worker.ts

## Purpose

Consumer-side handler that drains a single queued email job: validates the payload, renders the EJS template, and sends it over SMTP. It is the counterpart to `enqueueEmail` in `mailer.ts` and is wired into the worker loop by `consumeFromQueue` when a broker is configured. It performs no locale resolution — all strings are already final copy at the time the job was published.

## Key elements

- **`handleEmailJob(job: Partial<EmailJobPayload>): Promise<boolean>`** — Exports the core handler. Returns `true` on successful send, `false` on a permanent refusal (missing `to` or `templateName`, i.e. dead-letter), and *throws* on transient SMTP failure so `consumeFromQueue` can route the job to its TTL retry queue.
- **`discardJobAttachments(attachments?)`** — Internal helper. Deletes every spooled attachment file referenced by the job. Called only on final outcomes (success or permanent refusal), never before a retry attempt.
- **`EMAIL_QUEUE`** — Re-exported from `adapters/queue.ts` so the worker registry (`src/app/workers.ts`) can reference the queue name without importing the adapter directly.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports `sendTemplatedEmail`, the actual render-and-send routine this worker delegates to.
- **`src/infrastructure/adapters/mail-spool.ts`** — Imports `discardSpooled` to clean up temporary attachment files after a job reaches a terminal state.
- **`src/infrastructure/adapters/logger.ts`** — Imports `logger` for warn/error logging on invalid payloads and send failures.
- **`src/infrastructure/adapters/queue.ts`** — Source of the re-exported `EMAIL_QUEUE` constant.
- **`src/types/index.ts`** — Provides the `EmailJobPayload` type used throughout.
- **`src/app/workers.ts`** — Consumes `handleEmailJob` and `EMAIL_QUEUE` to register this handler in the worker loop.
- **`shared/contracts/asyncapi.workers.yaml`** — Documents the queue contract (message shape, topic) that this worker fulfills.
- **`tests/unit/infrastructure/adapters/email.worker.test.ts`** — Unit tests for `handleEmailJob` and attachment-discard behavior.

## Notes

- **Return-value semantics are load-bearing.** `true` = done, `false` = dead-letter (irrecoverable), `throw` = retry. `consumeFromQueue` branches on all three; a mistaken `false` where a `throw` was intended will permanently lose the email.
- **`Partial<EmailJobPayload>` is deliberate.** The broker delivers whatever bytes were published; every field is treated as untrusted until the guard at the top of `handleEmailJob` narrows it. ESLint `no-unnecessary-condition` is suppressed accordingly.
- **Attachments survive retries on purpose.** `discardJobAttachments` is never called in the `.catch` path — the next attempt still needs the file on disk.
- **No locale context.** The job may execute in a different process long after the originating request ended; all user-facing strings are resolved before the job is enqueued.
