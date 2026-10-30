---
source: src/infrastructure/adapters/mailer.ts
sha256: 2400de2ca6392a96c79fbd4612369f1f683fe17b17fbccfcb5c9872fe170a789
generated_at: 2026-10-29T01:56:23.596763+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/mailer.ts

## Purpose
The email adapter that renders EJS templates into HTML, assembles a nodemailer envelope, and dispatches it through a named transport — either inline or via a RabbitMQ queue. It is the single public surface every caller uses to send mail, keeping EJS, nodemailer, spool, and transport concerns behind one set of exported functions.

## Key elements

- **`sendTemplatedEmail(request, templateName, data)`** — Core send. Wraps the operation in an OTel span (`email.send`), resolves the configured transport, calls its `send()` with a `render` callback that invokes `renderMessage`, and logs the `messageId` on success. Never discards spooled attachments (retry-safe).
- **`sendInline(request, templateName, data)`** — Calls `sendTemplatedEmail` then discards all spooled attachment keys in a `.finally()`. Used only on the inline (non-queued) path where no retry chain exists.
- **`enqueueEmail`** (exported, truncated in source) — Queue-aware dispatch: publishes to `EMAIL_QUEUE` when RabbitMQ is reachable, otherwise falls back to `sendInline`. Never rejects; failures are logged and resolved.
- **`EmailContent`** (interface) — The contract a module's `emails.ts` builder returns: `{ template, subject, data }`. `template` is a module-prefixed name without extension; `data` is the fully-translated render context.
- **`renderMessage`** (private) — Renders the EJS template via `ejs.renderFile` (root = `process.cwd()`) and resolves attachments in parallel, then assembles the `SendMailOptions` object with a hard-coded `from`.
- **`resolveAttachments`** (private) — Maps `{ filename, key }` spool references to `{ filename, content: Buffer }` by calling `resolveSpooled` + `readFile`. Unresolvable keys are logged and dropped.
- **Re-exports from `template-registry`** — `registerTemplateDirectories`, `templateFile`, `registeredTemplateNames` are re-exported so callers import the template API from this file.

## Relationships

- **`mail-transports.ts`** — `resolveMailTransport` is called inside `sendTemplatedEmail`; the returned transport's `send()` performs the actual SMTP/API delivery.
- **`mail-spool.ts`** — `resolveSpooled` / `discardSpooled` handle attachment file lifecycle; this adapter reads bytes and (on the inline path) deletes them.
- **`queue.ts`** — `publishToQueue` and the `EMAIL_QUEUE` constant are used by `enqueueEmail`; the queue name lives here so infrastructure doesn't import application code.
- **`config.ts`** — `mailConfig()` supplies `NODE_SMTP_SENDER` (always the `from`) and `NODE_MAIL_TRANSPORT` (selects the transport, also set as an OTel span attribute).
- **`template-registry.ts`** — `templateFile` converts the logical template name to a filesystem path; the three registry exports are re-exported through this file.
- **`tracer.ts`** — `withSpan` wraps the entire send operation; span attributes include `messaging.system` and `email.template`.
- **`logger.ts`** — `logger` is used for info (messageId on success) and warn (unresolvable attachment key) calls.
- **`email.worker.ts`** — The consumer side; dequeues jobs and calls into this adapter's send path, with its own `discardJobAttachments` for the queued retry case.
- **`src/modules/account/emails.ts` / `services/mail.ts` / `services/reap-inactive.ts`** — Producers that build `EmailContent` objects and call `enqueueEmail`.
- **Contract / integration tests** (`account/tests/…`) — Exercise the send and queue paths end-to-end.

## Notes

- **`from` is never read from the job.** `renderMessage` hard-codes `mailConfig().NODE_SMTP_SENDER`; a forged job cannot override the sender or inject `cc`, `bcc`, `envelope`, etc. because the envelope is built from named fields, not spread.
- **Attachments are Buffers, not paths or streams.** Transports run with `disableFileAccess`; using a stream would leak an open file descriptor on each retry.
- **`sendTemplatedEmail` has no `.catch()`.** Rejections propagate so `withSpan` marks the span errored and the caller (or the worker's nack path) can react.
- **Spooled attachments are NOT discarded by `sendTemplatedEmail`.** Only `sendInline` (no retry) and `email.worker.ts` (after the final attempt) delete them.
- **EJS `root: process.cwd()`** makes leading-`/` includes (e.g. `/shared/templates/layouts/…`) resolve correctly regardless of how deeply the template lives under `src/modules/<name>/templates`.
- **`data` is the complete render context.** No locale lookup, no `t()` helper; every interpolated string was translated by the producer while the originating request was still alive.
- **Stryker mutation-testing annotations** (`Stryker disable/restore`) guard the warn-log and info-log lines from being mutated away.
