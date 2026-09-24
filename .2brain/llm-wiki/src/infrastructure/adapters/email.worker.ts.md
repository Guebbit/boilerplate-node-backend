---
source: src/infrastructure/adapters/email.worker.ts
sha256: a25d9125de4dfa9c903741613e748f4b438e8cbe89b405a33ce8b19c1b29ad41
generated_at: 2026-09-23T17:38:42.906853+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/email.worker.ts

## Purpose

Consumer-side handler for queued email jobs: renders an EJS template from a spooled attachment and sends it over SMTP via Nodemailer. It is the drain counterpart to `enqueueEmail` in `mailer.ts` and is wired in by `consumeFromQueue` when a message broker is configured. It performs no locale resolution — all user-facing strings are already resolved by the producer before the job is published.

## Key elements

- **`EMAIL_QUEUE`** (re-exported from `adapters/queue.ts`) — the queue name for email jobs; re-exported here so the worker registry can reference it from a single import.
- **`discardJobAttachments`** (module-private) — deletes every spooled attachment file for a job. Called only on FINAL outcomes (success or permanent refusal), never on retryable failure.
- **`handleEmailJob(job: Partial<EmailJobPayload>)`** (exported) — processes one job. Returns `Promise<boolean>`:
  - `true` → email sent successfully.
  - `false` → permanent refusal (missing `to` or `templateName`); job is dead-lettered.
  - *throws* → transient SMTP/transport error; left to the broker's TTL retry queue.

## Relationships

- **`adapters/mailer.ts`** — imports `nodemailer`, the function that actually renders the template and dispatches the SMTP connection.
- **`adapters/mail-spool.ts`** — imports `discardSpooled` to clean up temporary attachment files.
- **`adapters/logger.ts`** — imports `logger` for warn/error structured logs.
- **`adapters/queue.ts`** — source of the `EMAIL_QUEUE` constant re-exported by this file.
- **`src/types/index.ts`** — source of the `EmailJobPayload` type imported for typing the job parameter.
- **`src/app/workers.ts`** — registers `handleEmailJob` against `EMAIL_QUEUE` in the worker app.
- **`shared/contracts/asyncapi.workers.yaml`** — declares the queue name and payload schema that this consumer must satisfy.
- **`tests/unit/infrastructure/adapters/email.worker.test.ts`** — unit tests covering the success, refusal, and failure paths of `handleEmailJob`.

## Notes

- **Return-value triad is load-bearing.** The broker distinguishes `false` (permanent, dead-letter) from a thrown error (transient, TTL-retried). Do not collapse them.
- **Attachment lifecycle is outcome-dependent.** Files are spooled to disk; they are deleted only after a definitive terminal state. A rethrown job must still find its attachment on the next attempt.
- **`Partial<EmailJobPayload>` is intentional.** The broker delivers an untrusted blob; every field is a "claim until checked." The guard at the top of `handleEmailJob` is the only validation, and TypeScript cannot propagate its narrowing into the `.then()` closure (hence the `!` on `job.request`).
- **No locale/i18n here by design.** The job may execute in a different process long after the originating request ended; `job.data` is already fully resolved copy.
