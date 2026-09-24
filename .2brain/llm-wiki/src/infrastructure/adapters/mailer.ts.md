---
source: src/infrastructure/adapters/mailer.ts
sha256: f5b40837ceb42a3ff3623ab271458f87738c98a152e599a510dfe70057bb4a2d
generated_at: 2026-09-23T17:40:51.056821+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/mailer.ts

## Purpose

Central email-sending adapter: renders EJS templates, delivers via nodemailer (SMTP, JSON-log, or in-memory outbox), and optionally enqueues jobs through the message queue for async delivery. It is the single point where a named template becomes a rendered, sent (or recorded) email.

## Key elements

- **`emailTemplatesDirectory()`** — Returns the absolute path to EJS templates, overridable via `NODE_EMAIL_TEMPLATES_DIR`; defaults to `shared/templates/emails`.
- **`templateFile(templateName)`** — The single place a template name is joined with `.ejs` to produce a filesystem path.
- **`MailTransport`** / **`resolveMailTransport()`** — Union type (`smtp | log | outbox`) and the resolver that picks one per send. Demo mode forces `outbox`; `NODE_ENV=test` forces `log`; otherwise `NODE_MAIL_TRANSPORT` (default `smtp`) decides.
- **`missingSmtpCompanions()`** — Returns which of `NODE_SMTP_USER`, `NODE_SMTP_PASS`, `NODE_SMTP_SENDER` are unset when `NODE_SMTP_HOST` is set. Used by the boot gate to reject a partial SMTP config.
- **`resetTransporter()`** — Test seam that clears the memoised nodemailer transport so a suite can vary env and get a fresh one.
- **`getTransporter()`** (internal) — Lazily builds and memoises the nodemailer `Transporter`. Derives `secure` from port (465 → implicit TLS; 587 → STARTTLS). Uses `jsonTransport` when transport is `log`.
- **`nodemailer(request, templateName, data)`** — The core send: resolves spooled attachments, renders the EJS template, dispatches via SMTP/log/outbox. Wrapped in an OTel span (`email.send`). Returns `Promise<SentMessageInfo>`.
- **`enqueueEmail`** (referenced) — Publishes an `EmailJobPayload` to the `EMAIL_QUEUE` RabbitMQ queue for async delivery by the worker.

## Relationships

- **`queue.ts`** — Imports `publishToQueue`, `EMAIL_QUEUE`, `isQueueEnabled`, `JobPriority` to enqueue jobs; `EMAIL_QUEUE` is the canonical queue-name string shared with the consumer.
- **`email.worker.ts`** — The queue consumer that drains `EMAIL_QUEUE` and calls `nodemailer()` to perform the actual send; owns the retry chain and attachment discarding.
- **`mail-spool.ts`** — Provides `resolveSpooled` / `discardSpooled` for attachment files that travel by key across the queue boundary.
- **`demo-outbox.ts`** — `recordDemoEmail` stores rendered metadata in-memory for `GET /__test/emails` during demo runs.
- **`demo-profile.ts`** — `isDemoMode()` forces the outbox transport regardless of env config.
- **`environment.ts`** — `environmentNumber` (port) and `environmentChoice` (transport) read validated env values.
- **`logger.ts`** — Logs send failures and unresolved attachment keys.
- **`tracer.ts`** — `withSpan` wraps the send operation; span attributes use OTel semantic-convention keys (`messaging.system`, `messaging.destination.name`).
- **`required-config.ts`** — Calls `missingSmtpCompanions()` at boot to reject a host-without-credentials configuration.
- **`src/modules/account/emails.ts`** — Defines the `EmailContent` shapes and template names consumed here.
- **`src/modules/account/services/{authentication,verification,profile}.ts`** — Upstream callers that build `EmailJobPayload` and invoke `enqueueEmail` or `nodemailer`.
- **`src/modules/account/tests/contract/api.contract.test.ts`** — Exercises the mailer in `log`/`outbox` transport to assert template names and data without opening sockets.

## Notes

- The transport is **memoised and lazy**: env is read on first send, not at import time. `resetTransporter` exists specifically so tests can change env and get a fresh transport without module-registry hacks.
- `secure` is derived from the **numeric** port value, not a string comparison, so `0465` still maps to implicit TLS.
- `nodemailer()` **never discards** a spooled attachment — that is the caller's responsibility (`enqueueEmail`'s inline path or `email.worker.ts#discardJobAttachments`) to keep retry attempts from resolving a deleted file.
- Template names (not paths) cross the RabbitMQ boundary; the `.ejs` extension is appended only in `templateFile`, keeping the name portable to another process or frontend assertion.
- SMTP is **optional by design**: leaving `NODE_SMTP_HOST` unset is valid (the email 2FA factor is gated on it). A host *without* credentials is not — the boot gate rejects that.
