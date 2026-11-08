---
source: src/infrastructure/adapters/mailer.ts
sha256: c3e92b17885a8ff313844ea6a1787d80d0c5d587b7090e783bfbd03bbe3433ed
generated_at: 2026-11-08T03:21:43.365991+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/mailer.ts

## Purpose

The email adapter: renders EJS templates into HTML, assembles a nodemailer envelope, and dispatches it through a named transport — either synchronously or by publishing a job to the message queue. It is the single public surface every module uses to send templated email, and it centralises sender identity, attachment resolution, and transport selection so callers never touch nodemailer or EJS directly.

## Key elements

- **`sendTemplatedEmail(request, templateName, data)`** – Public. Renders the template, resolves attachments, resolves the transport, and sends. Wrapped in an OTel span (`email.send`) with `messaging.system` and `email.template` attributes. Never discards spooled attachments (retry-safe).
- **`EmailContent`** (interface) – The shape a module's `emails.ts` builds and a controller hands to `enqueueEmail`: `{ template, subject, data }`.
- **`sendInline(request, templateName, data)`** – Private. Calls `sendTemplatedEmail`, then discards every spooled attachment in a `.finally()` block. Used on the non-queued path where no retry chain exists.
- **`resolveAttachments(attachments)`** – Private. Maps each `{ filename, key }` spool reference to `{ filename, content: Buffer }` via `resolveSpooled` + `readFile`. Unresolvable keys are logged and skipped.
- **`renderMessage(envelope, attachments, templateName, data)`** – Private. Renders EJS (with `root: process.cwd()`) and returns a fully-formed `SendMailOptions` object with named fields only (never spreads the raw job request).
- **Re-exports** – `registerTemplateDirectories`, `templateFile`, `registeredTemplateNames` are re-exported from `template-registry` so this file remains the sole import target for template concerns.

## Relationships

- **`mail-transports.ts`** – `resolveMailTransport()` returns the transport object whose `.send()` actually delivers the message; this adapter delegates all SMTP/provider logic there.
- **`mail-spool.ts`** – `resolveSpooled` maps a key to a file path for reading; `discardSpooled` deletes the file after a confirmed send.
- **`queue.ts`** – `enqueueEmail` (the controller-facing entry point) publishes an `EmailJobPayload` to `EMAIL_QUEUE` via `publishToQueue` when the broker is reachable.
- **`config.ts`** – `mailConfig()` supplies the sender address and transport name; `supportEmail()` provides the default `Reply-To`.
- **`logger.ts`** – Warn on unresolvable attachment keys; info on successful send with `messageId`.
- **`tracer.ts`** – `withSpan` wraps the entire send operation for observability.
- **`template-registry.ts`** – Source of the re-exported template-path and registration helpers.
- **`email.worker.ts`** – Queue consumer that calls `sendTemplatedEmail` and owns the retry/discard lifecycle for spooled attachments (`discardJobAttachments`).
- **`src/modules/account/emails.ts` / `services/mail.ts` / `services/reap-inactive.ts`** – Producers that build `EmailContent` and call `enqueueEmail` to trigger account-related mail.
- **`src/app.ts`** – Application bootstrap; registers template directories and wires the adapter into the request lifecycle.

## Notes

- **Security:** The envelope is built from explicitly named fields. The job's own `from` is never read; a forged payload cannot inject `cc`, `bcc`, `envelope`, or arbitrary headers.
- **Attachments are Buffers, not paths or streams.** Transports run with `disableFileAccess`; a stream would leak an open file descriptor per retry.
- **Attachment lifecycle is split by call site:** `sendTemplatedEmail` must *not* discard spooled files (a queued retry may still need them). `sendInline` and the worker's terminal path are the two places that call `discardSpooled`.
- **No locale resolution at render time.** The `data` object is the complete, pre-translated render context; the worker may run in a different process long after the originating request ended.
- **EJS `root: process.cwd()`** is required so that a template's root-relative `include` (leading `/`) resolves correctly regardless of how deeply nested the template file is under `src/modules/`.
- **No `.catch()`** on the send promise chain — rejections propagate so `withSpan` can mark the span errored and the queue worker's nack path can react.
- **Stryker mutation-testing guards** are present around the warn-log and the info-log; do not remove them without coordinating with the mutation-testing config.
