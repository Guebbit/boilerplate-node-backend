# src/infrastructure/adapters/mailer.ts

## Purpose

Email delivery adapter: renders EJS templates to HTML and sends them over SMTP (or records them to the demo outbox). Provides both a synchronous `nodemailer` send and an async `enqueueEmail` path that publishes to a message queue so a slow mail server cannot block an HTTP response. It owns the SMTP transport configuration, the template-path resolution, and the queue payload contract shared with the consumer.

## Key elements

- **`emailTemplatesDirectory()`** — Resolves the EJS template directory; overridable via `NODE_EMAIL_TEMPLATES_DIR`, defaults to `shared/views/templates-emails`.
- **`templateFile(templateName)`** — Maps a bare template name (e.g. `orders.order-confirm`) to its `.ejs` file path. The single point where a name becomes a filesystem path.
- **`getTransporter()`** (module-internal) — Lazy, memoised Nodemailer `Transporter`. Reads SMTP host/port/auth from the environment on first call. In `NODE_ENV=test` returns a `jsonTransport` (no socket). `secure` is derived from the port (465 → implicit TLS, otherwise STARTTLS).
- **`resetTransporter()`** — Test seam that discards the memoised transport so a suite can re-read changed SMTP env vars.
- **`nodemailer(request, templateName, data)`** — Renders the named EJS template with the given data, then sends via the SMTP transport. Wraps the operation in an OTel span (`email.send`). In demo mode delegates to `recordDemoEmail` instead.
- **`enqueueEmail`** *(truncated in source)* — Queue-aware dispatch; the recommended entry point for request paths. Publishes an `EmailJob` to the queue when enabled, otherwise falls through to inline send.
- **`EmailRequest`** (type) — JSON-safe envelope shape (`EmailJobPayload['request']`). Deliberately narrower than Nodemailer's `SendMailOptions` so it survives `JSON.stringify` in a queue payload.
- **`EmailJob`** (type) — Alias for `EmailJobPayload`; the exact wire contract shared with the worker.
- **`EmailContent`** (interface) — `{ template, subject, data }` returned by each module's `emails.ts` and passed to `enqueueEmail`.

## Relationships

- **`src/infrastructure/adapters/queue.ts`** — Imports `isQueueEnabled`, `publishToQueue`, and `EMAIL_QUEUE`. `enqueueEmail` publishes to this queue; the queue name lives here (not in the worker) so producer and consumer agree on spelling without a cross-layer import.
- **`src/infrastructure/adapters/email.worker.ts`** — Consumer that drains `EMAIL_QUEUE`. Re-exports the `EmailJob` type defined here rather than declaring its own, keeping one source of truth.
- **`src/infrastructure/adapters/demo-outbox.ts`** — Calls `isDemoMode()` and `recordDemoEmail()` to short-circuit real SMTP during the demo profile.
- **`src/infrastructure/adapters/logger.ts`** — Logs the SMTP `messageId` on successful send.
- **`src/infrastructure/observability/tracer.ts`** — Wraps the send in `withSpan('email.send', …)` and sets OTel messaging attributes (`messaging.system`, `messaging.destination.name`, `email.template`).
- **`src/infrastructure/runtime/environment.ts`** — Uses `environmentNumber` to parse `NODE_SMTP_PORT` with a safe integer constraint.
- **`src/modules/account/emails.ts`, `src/modules/delivery/emails.ts`** — Producers that build `EmailContent` objects (template name + pre-translated subject/data) and hand them to `enqueueEmail`.
- **`src/modules/account/services/verification.ts`, `src/modules/cart/services/checkout.ts`, `src/modules/delivery/service.ts`** — Application services that trigger email sends through the `emails.ts` helpers in their respective modules.
- **`src/modules/cart/tests/integration/service.test.ts`, `src/modules/delivery/tests/integration/service.test.ts`** — Integration suites that exercise the full send path (demo outbox or jsonTransport) end-to-end.

## Notes

- **Template names are shared identifiers, not paths.** They travel through RabbitMQ to a consumer in another process, so they are bare names (`orders.order-confirm`) with the owning module as a prefix. `.ejs` is appended only inside `templateFile`, the single name→path boundary.
- **All strings in `EmailContent.data` are pre-translated by the producer.** The mailer and the worker (potentially another process, hours later) never see a locale or translation function—there is no `t()` in the render context.
- **`EmailRequest` is deliberately narrower than `SendMailOptions`.** Buffers in attachments would corrupt through `JSON.stringify`. A project that needs binary attachments should pass a storage key instead.
- **No `.catch()` on the send chain.** Rejections propagate so `withSpan` marks the span as errored and the caller (or the worker's nack path) can react.
- **`secure` is compared as a number**, not a string, so a zero-padded `"0465"` env value still resolves correctly and does not open a plaintext connection to a TLS-only port.
