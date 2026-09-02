# src/infrastructure/adapters/mailer.ts

## Purpose

Email infrastructure adapter: renders EJS templates into HTML and delivers via SMTP (nodemailer), with an optional path through the message queue. It is the single point where a logical email (template name + data) becomes a wire-format SMTP message or a queued job, isolating all transport concerns from application modules.

## Key elements

- **`emailTemplatesDirectory()`** — Resolves the absolute directory containing `.ejs` templates. Overridable via `NODE_EMAIL_TEMPLATES_DIR`; defaults to `shared/views/templates-emails`.
- **`templateFile(templateName)`** — Maps a bare template name (no extension) to the resolved `.ejs` path. The single place `.ejs` is appended.
- **`getTransporter()`** (internal) — Lazy singleton nodemailer `Transporter`. Uses `jsonTransport` under `NODE_ENV=test`. Reads SMTP host/port/user/pass from env on first call.
- **`resetTransporter()`** — Test seam; clears the memoised transport so a suite can re-read changed env vars without re-importing the module.
- **`nodemailer(request, templateName, data)`** — Renders the EJS template, then sends via the transporter (or records to the demo outbox). Wraps the operation in an OTel span with `messaging.*` attributes. Rejections propagate (no internal `.catch`).
- **`EmailContent`** (interface) — The shape a module's `emails.ts` returns: `{ template, subject, data }`. All strings must already be translated.
- **`EmailRequest`** (type) — The JSON-safe envelope carried in a queue job; deliberately narrower than nodemailer's `SendMailOptions` to survive `JSON.stringify`.
- **`EmailJob`** (type) — Re-export of `EmailJobPayload` from `@types`; the producer/consumer shared contract.
- **`enqueueEmail`** — Queue-aware dispatch (truncated in source): checks `isQueueEnabled`, publishes to `EMAIL_QUEUE` with a priority, or falls through to `nodemailer` inline.

## Relationships

- **`queue.ts`** — Imports `isQueueEnabled`, `publishToQueue`, `EMAIL_QUEUE`, and `JobPriority` for the queue dispatch path.
- **`email.worker.ts`** — The queue consumer that calls back into this file's `nodemailer` function; re-exports `EmailJob` rather than redefining it.
- **`demo-outbox.ts`** — Imports `isDemoMode` and `recordDemoEmail`; when demo mode is active, sends are recorded instead of delivered.
- **`logger.ts`** — Imports `logger` to log the SMTP `messageId` on successful send.
- **`tracer.ts`** — Imports `withSpan` to wrap each send in an OTel span.
- **`environment.ts`** — Imports `environmentNumber` for safe numeric parsing of `NODE_SMTP_PORT`.
- **Module `emails.ts` files** (account, delivery, cart/checkout) — Produce `EmailContent` objects and call `enqueueEmail`/`nodemailer`; they never import nodemailer directly.
- **`scripts/reap-inactive-accounts.ts`** — Trigger for account-related notification emails flowing through this adapter.

## Notes

- **Templates are not per-module.** They live in `shared/views/templates-emails/` because the template *name* crosses process boundaries via RabbitMQ; a path into `src/modules` would not be portable to the worker. Ownership is encoded in the name prefix (e.g. `orders.order-confirm`).
- **No translation at render time.** The `data` object is the complete render context; all user-facing strings are translated by the producing module while the request is alive. The adapter (and the worker, potentially hours later) never needs a locale.
- **`EmailRequest` ≠ `SendMailOptions`.** The type is intentionally narrow so every field survives `JSON.stringify` for the queue. Attachments should be sent as storage keys, not inline buffers.
- **`secure` is port-derived and compared numerically.** `smtpPort() === 465` (number) avoids a zero-padded `"0465"` string being treated as "not 465" and opening a plaintext socket to an implicit-TLS port.
- **Caller overrides win.** `from` and `html` are set as defaults *before* the `...request` spread, so a caller-supplied envelope field takes precedence.
- **Failure surfaces at send time, not boot.** Empty SMTP credentials cause a server rejection on first send; email is not a hard startup dependency.
