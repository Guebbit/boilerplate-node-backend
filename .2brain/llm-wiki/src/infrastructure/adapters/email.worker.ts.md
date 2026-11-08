---
source: src/infrastructure/adapters/email.worker.ts
sha256: 9a9ed67a29e505174dc67fb471cb9be7e8d2d32095cd7b49d7c6a3e39273b1e1
generated_at: 2026-11-08T03:18:31.275599+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/email.worker.ts

## Purpose

Consumer-side handler for queued email jobs. When a broker is configured, `consumeFromQueue` invokes this module to render an EJS template and dispatch it over SMTP. It is the drain half of the producer/consumer pair with `enqueueEmail` in `mailer.ts`. It performs no locale or i18n work — all strings are pre-resolved by the producer before the job is published.

## Key elements

- **`handleEmailJob(job: Partial<EmailJobPayload>): Promise<boolean>`** — The sole entry point. Validates the payload, calls `sendTemplatedEmail`, and manages attachment lifecycle. Returns `false` for a *permanent* refusal (missing `to` or `templateName`) → dead-letter. Rejects (throws) for transient SMTP faults → TTL retry. Returns `true` on successful send.
- **`discardJobAttachments(attachments?)`** — Internal helper. Calls `discardSpooled(key)` for every attachment in parallel. Invoked only on the two final outcomes (success, permanent refusal); **never** on a rethrow, so a retry still has its spooled file.
- **`EMAIL_QUEUE`** (re-export) — Re-exported from `queue.ts` so the worker registry in `app/workers.ts` can reference the queue name without importing the adapter directly.

## Relationships

- **`mailer.ts`** — Provides `sendTemplatedEmail`, the actual SMTP send. This file is explicitly its consumer counterpart to `enqueueEmail`.
- **`mail-spool.ts`** — Provides `discardSpooled(key)` used by `discardJobAttachments` to clean up temp files after a final outcome.
- **`logger.ts`** — Structured logging for the two failure/warning paths (invalid payload, send failure).
- **`queue.ts`** — Source of the `EMAIL_QUEUE` name constant re-exported here.
- **`app/workers.ts`** — Registers `handleEmailJob` with `consumeFromQueue`; the only caller in production.
- **`types/index.ts`** — Supplies the `EmailJobPayload` type used in the function signature.
- **`email.worker.test.ts`** — Unit tests covering validation, success, failure-rethrow, and attachment-discard paths.

## Notes

- **Return-value contract is load-bearing:** `true` = sent, `false` = permanent (dead-letter), *throw* = retryable. `consumeFromQueue` branches on exactly this distinction. Do not return `false` for transient errors.
- **Attachments survive retries by design.** The spooled file is only removed after a final outcome. If you add a new early-exit path, it must go through `discardJobAttachments` or the spool leaks.
- **`Partial<EmailJobPayload>` is intentional.** The broker delivers an opaque blob; every field is a *claim* until the guard above proves it. The `!` non-null assertion after the guard exists only because TypeScript cannot carry narrowing into a `.then` closure.
- **No locale context at runtime.** The job may execute in a different process long after the originating request ended. All user-facing strings in `job.data` are already final copy.
