---
source: src/infrastructure/adapters/mailer.ts
sha256: d5738da72104e8f0c18bd541cb9a71e7a0aef04ebf52f5a732de1d22a6378468
generated_at: 2026-10-14T07:46:59.726332+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/mailer.ts

## Purpose

The mail adapter. It renders EJS templates into a complete Nodemailer envelope, resolves spooled attachments to byte buffers, and dispatches through a named transport — either synchronously or by publishing a job onto the message queue for async delivery. It is the single public surface that module-level email builders (`emails.ts`) and controllers use to send mail.

## Key elements

- **`sendTemplatedEmail(request, templateName, data)`** — exported. Renders the template, resolves attachments, and sends via the configured transport. Synchronous: the caller's promise settles only after the transport accepts the message. Wraps the operation in an OTel span (`email.send`). Does **not** discard spooled attachments (retry-chain safety).
- **`EmailContent`** — exported interface. The shape a module's `emails.ts` returns: `{ template, subject, data }`. All strings in `data` must be pre-translated by the producer.
- **`enqueueEmail`** — exported (truncated in source). The queue-aware dispatch controllers should call. Publishes to `EMAIL_QUEUE` when RabbitMQ is reachable; falls back to `sendInline` when it is not.
- **`sendInline`** — internal. Sends via `sendTemplatedEmail`, then discards spooled attachments in `.finally()`. Safe only because there is no retry chain behind it.
- **`renderMessage`** — internal. Builds the final `SendMailOptions` from named fields (never spreads the job request). Renders EJS with `root: process.cwd()` so root-relative includes resolve correctly regardless of template depth.
- **`resolveAttachments`** — internal. Maps spool keys to `{ filename, content: Buffer }` via `readFile`. Unresolvable keys are logged and dropped.
- **Re-exports** — `registerTemplateDirectories`, `templateFile`, `registeredTemplateNames` from `template-registry`, so all other callers import from this one file.

## Relationships

- **`config.ts`** — supplies `mailConfig()` for the fixed sender address (`NODE_SMTP_SENDER`) and the transport name (`NODE_MAIL_TRANSPORT`).
- **`mail-transports.ts`** — `resolveMailTransport()` returns the transport object that actually calls `send`; the adapter never talks to SMTP directly.
- **`mail-spool.ts`** — `resolveSpooled` maps a key to a filesystem path; `discardSpooled` deletes it. The adapter reads attachment bytes and delegates cleanup.
- **`queue.ts`** — provides `publishToQueue`, the `EMAIL_QUEUE` name constant, and the `JobPriority` type. The queue name lives here (not in application code) so producer and consumer share one spelling.
- **`email.worker.ts`** — the queue consumer. Calls `sendTemplatedEmail` and owns the retry/nack lifecycle, including attachment discard after the final attempt.
- **`template-registry.ts`** — resolves a template name to a filesystem path (`templateFile`) and tracks registered names. Kept as a leaf module (no `ejs`/`nodemailer` import) for test-setup compatibility.
- **`logger.ts`** — structured logging for send confirmation, warnings, and errors.
- **`tracer.ts`** — `withSpan` wraps the send operation; standard `messaging.system` attribute lets trace backends group this with other messaging spans.
- **`src/modules/account/emails.ts` / `services/mail.ts` / `two-factor/registry.ts`** — producers that build an `EmailContent` and hand it to `enqueueEmail`.
- **`src/modules/account/tests/contract/*.contract.test.ts`** — contract tests that exercise the email-sending path end-to-end.
- **`scripts/ops/reap-inactive-accounts.ts`** — operational script that sends account-reaping notices through this adapter.
- **`src/app.ts`** — application entry; registers template directories and wires the mail adapter into the server lifecycle.

## Notes

- **Attachments are always Buffers, never paths or streams.** Transports run with `disableFileAccess`; a stream would leak an open file descriptor per retry attempt.
- **The envelope is built from explicit named fields.** Spreading the job's `request` is deliberately avoided so a forged or stale job cannot inject `from`, `cc`, `bcc`, `headers`, `envelope`, etc.
- **`sendTemplatedEmail` never discards spooled attachments.** Only `sendInline` (no retries) and `email.worker.ts` (after the final attempt) call `discardSpooled`. Discarding mid-retry would break every subsequent attempt.
- **`data` is the complete, pre-translated render context.** No locale lookup, no `t` function, no ambient state. The queue carries template name + data; rendering happens on the consumer side, possibly in a different process hours later.
- **EJS `root: process.cwd()`.** Templates use root-relative includes (leading `/`); this keeps them working regardless of how deep the template file is nested under `src/modules/<name>/templates/`.
- **OTel span attributes exclude the recipient.** Trace backends apply none of the logger's PII redaction, so only `messaging.system` and `email.template` are set.
- **`template-registry` is intentionally a leaf module** with no `ejs` or `nodemailer` import, so `tests/support/setup.ts` can stub or mock it without pulling in those packages.
