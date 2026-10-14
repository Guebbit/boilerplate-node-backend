---
source: src/infrastructure/adapters/email.worker.ts
sha256: 9a9ed67a29e505174dc67fb471cb9be7e8d2d32095cd7b49d7c6a3e39273b1e1
generated_at: 2026-10-14T07:43:06.407321+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/email.worker.ts

## Purpose

Consumer-side handler that drains one queued email job: it validates the payload, renders the EJS template via `sendTemplatedEmail`, and discards spooled attachments. It is the worker counterpart to `enqueueEmail` in `adapters/mailer.ts` and is wired in by `consumeFromQueue` when a broker is configured. All i18n resolution happens upstream in the producer; this file only interpolates and sends.

## Key elements

- **`handleEmailJob(job: Partial<EmailJobPayload>): Promise<boolean>`** — Main export. Returns `true` on successful send, `false` on permanent refusal (missing `to` or `templateName`), and *throws* on transient SMTP/network faults so `consumeFromQueue` can apply its TTL retry.
- **`discardJobAttachments(attachments?)`** (module-private) — Fans out `discardSpooled(key)` for every attachment key. Called only on FINAL outcomes (success or permanent refusal); deliberately skipped on rethrow so a retry still has its file.
- **`EMAIL_QUEUE`** — Re-exported from `adapters/queue.ts` for the worker registry; the queue name is owned by the adapter layer.

## Relationships

- **`adapters/mailer.ts`** — Calls `sendTemplatedEmail(job.request, job.templateName, job.data)` to render + send.
- **`adapters/mail-spool.ts`** — Calls `discardSpooled(key)` to remove attachment files from disk.
- **`adapters/logger.ts`** — Logs a `warn` on permanent refusal and an `error` on transient failure.
- **`adapters/queue.ts`** — Source of the `EMAIL_QUEUE` constant re-exported here.
- **`src/types/index.ts`** — Provides the `EmailJobPayload` type used for the job parameter.
- **`src/app/workers.ts`** — Registers `handleEmailJob` as the consumer for `EMAIL_QUEUE`.
- **`shared/contracts/asyncapi.workers.yaml`** — Defines the queue/message contract this worker fulfils.
- **`tests/unit/infrastructure/adapters/email.worker.test.ts`** — Unit tests covering the success, permanent-refusal, and transient-failure paths.

## Notes

- **`false` vs. throw is the retry contract.** `false` means the job is dead (no recipient, no template) and should be dead-lettered. A thrown error means "try again later" and is picked up by the TTL retry queue. Conflating the two will either drop valid emails or poison the dead-letter queue.
- **`Partial<EmailJobPayload>` is intentional, not laziness.** The broker delivers an opaque payload; every field is a claim until the guard at the top proves it present. Do not "tighten" the parameter type.
- **Attachment cleanup is asymmetric by design.** On success and on permanent refusal the spooled files are discarded; on a transient failure they are left in place so the next retry attempt can still resolve them.
- **No locale/i18n code lives here.** This worker may execute in a separate process long after the originating request, so there is no locale store to restore. All user-facing strings are pre-resolved by the producer before the job is published.
