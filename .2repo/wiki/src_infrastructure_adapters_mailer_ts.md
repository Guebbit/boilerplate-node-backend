# src/infrastructure/adapters/mailer.ts

## Purpose

Email delivery adapter: renders EJS templates to HTML and sends them over SMTP via Nodemailer, or enqueues the job on RabbitMQ for async delivery. It is the single producer-side entry point that application modules (e.g. account verification, password reset) call to "send an email" without knowing about SMTP, templates, or queues.

## Key elements

- **`emailTemplatesDirectory()`** — Returns the absolute path to EJS templates. Reads `NODE_EMAIL_TEMPLATES_DIR` or falls back to `shared/views/templates-emails`. Lazy function (not constant) so it respects `.env` load order.
- **`templateFile(templateName)`** — Resolves a bare template name to a `.ejs` file path under `emailTemplatesDirectory()`. The only place the `.ejs` extension is appended.
- **`getTransporter()`** *(private)* — Lazily builds and memoises a single Nodemailer `Transporter`. In `NODE_ENV=test` it returns a `jsonTransport` (no socket). In production it reads `NODE_SMTP_HOST/PORT/USER/PASS/NAME` from the environment. `secure` is `true` only when port === 465.
- **`resetTransporter()`** — Test seam: clears the memoised transport so a suite can change SMTP config and get a fresh one without re-importing the module.
- **`nodemailer(request, templateName, data)`** — The inline send path. If in demo mode, records to the demo outbox and returns immediately. Otherwise wraps the full render → send cycle in an OTel span (`email.send`), renders the EJS template with the caller-supplied `data` (no locale/`t` context), and sends via the memoised transporter. Caller-supplied fields in `request` override the defaults (`from`, `html`). Rejections propagate (no `.catch`) so `withSpan` marks the span errored.
- **`EmailRequest`** *(type export)* — JSON-safe envelope shape (subset of Nodemailer options that survive `JSON.stringify`). Used as the queue payload contract.
- **`EmailJob`** *(type export, truncated)* — The full queue-message shape. Lives here (producer side) so producer and consumer share one definition.
- **`enqueueEmail`** *(mentioned, truncated)* — Queue-based send path: publishes an `EmailJob` to `EMAIL_QUEUE` when `isQueueEnabled()`. Preferred over `nodemailer()` on HTTP request paths to avoid blocking on a slow SMTP server.

## Relationships

- **`@infrastructure/adapters/queue`** — Imports `EMAIL_QUEUE` (queue name constant), `isQueueEnabled`, and `publishToQueue` for the async path. The queue name is defined in the queue adapter (not here) so both producer and consumer reference the same spelling.
- **`@infrastructure/adapters/email.worker.ts`** — The consumer that drains `EMAIL_QUEUE`. Re-exports the `EmailJob` type defined here rather than declaring its own.
- **`@infrastructure/adapters/demo-outbox.ts`** — `isDemoMode()` / `recordDemoEmail()` are called when the demo profile is active, replacing the SMTP send with a local record.
- **`@infrastructure/adapters/logger`** — Logs the SMTP `messageId` on successful send.
- **`@infrastructure/observability/tracer`** — `withSpan('email.send', …)` wraps the render + send cycle; span attributes use OTel incubating messaging conventions (`messaging.system`, `messaging.destination.name`).
- **`@infrastructure/runtime/environment`** — `environmentNumber('NODE_SMTP_PORT', 587, 1)` for the port value.
- **`src/modules/account/emails.ts`** and account controllers/services — Primary consumers: they define the `templateName` and `data` and call `nodemailer()` or `enqueueEmail()`.

## Notes

- **The `nodemailer` export shadows the Nodemailer package name.** Inside this file the imported `createTransport` etc. are used directly; external callers see a function called `nodemailer`.
- **Templates interpolate, they do not translate.** All human-readable strings must already be translated by the producer before `data` is passed in. The renderer has no access to locale or a `t()` helper.
- **Templates live under `shared/`, not under a module.** A bare template *name* travels through RabbitMQ to a worker that may be a separate process; resolving against `shared/` keeps the path portable where a `src/modules/…` path would not.
- **`secure` is compared numerically (`=== 465`), not as a string**, to prevent a zero-padded `0465` from being misread as "not 465" and opening a plaintext connection on a TLS-only port.
- **No `.catch()` on the send promise.** Rejection is deliberately allowed to propagate so `withSpan` records the error and the caller (or the queue worker's nack handler) can react.
- **`EmailRequest` is intentionally narrower than Nodemailer's `SendMailOptions`.** Only fields that survive `JSON.stringify` are included, because the queued path serialises the envelope. Buffers and Readable streams are excluded by design; a project needing attachments should pass a storage key and let the worker fetch bytes.
