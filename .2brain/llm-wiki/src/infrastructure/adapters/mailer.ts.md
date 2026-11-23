---
source: src/infrastructure/adapters/mailer.ts
source_sha256: 8be7068c084141c7287bc1e078d336a0aec1e2797cc89fc384ae842a8933a51f
context_sha256: f9283777763fc8d90b020034735c625e312fbeff1836232d95ddab2b0e0501c5
generated_at: 2026-11-22T02:40:18.332405+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/mailer.ts

## Purpose
The email adapter. It renders EJS templates into HTML bodies and delivers them through the transport named by `NODE_MAIL_TRANSPORT`. It can send synchronously or through the queue. It is the public surface of the mail pipeline for the rest of the app.

## Key elements
- **`sendTemplatedEmail(request, templateName, data)`**: sends one email synchronously inside an `email.send` OTel span.
  - The span carries `messaging.system` and `email.template` attributes. The recipient is deliberately left out.
  - It resolves the transport inside the promise chain, so an unknown transport name becomes a rejection instead of a sync throw.
  - It calls `transport.send({ request, templateName, data, render })`, where `render` lazily builds the message.
  - It logs `messageId` when the transport returns info.
  - It does not catch errors, so rejections reach `withSpan` and the caller (or the queue worker's nack path).
  - It never discards spooled attachments, because it may be one attempt in a retry chain.
- **`renderMessage` (internal)**: builds the nodemailer `SendMailOptions`.
  - The HTML comes from `ejs.renderFile(templateFile(name), { ...data }, { root: process.cwd() })`, rendered alongside the resolved attachments.
  - The message is built from named fields only, never by spreading the request, so a forged job cannot inject `cc`, `bcc`, `headers` and similar fields.
  - `from` is always `mailConfig().NODE_SMTP_SENDER`.
  - `replyTo` defaults to `supportEmail()`.
  - `messageId`, `inReplyTo` and `references` are set only when provided. `references` repeats `inReplyTo`.
  - A producer-supplied `html` overrides the rendered template.
- **`resolveAttachments` (internal)**: turns `{ filename, key }` spool references into `{ filename, content: Buffer }`.
  - Keys that fail to resolve are logged and skipped.
  - It uses Buffers because transports run with `disableFileAccess`, and streams would leak a file per retried attempt.
- **`EmailContent` (interface)**: a finished email, made of `template` (module-prefixed name, no extension), `subject` and `data` (both already translated).
- **`sendInline` (internal)**: calls `sendTemplatedEmail`, then discards spooled attachments once the send settles, whether it succeeded or failed. This is the inline path of `enqueueEmail`. The visible content stops partway through this function.
- **Re-exports** from `template-registry`: `registerTemplateDirectories`, `templateFile`, `registeredTemplateNames`.

## Relationships
- **`src/infrastructure/adapters/config.ts`**: supplies `mailConfig()` (sender, transport name) and `supportEmail()`.
- **`src/infrastructure/adapters/mail-transports.ts`**: `resolveMailTransport` picks the transport that does the actual sending.
- **`src/infrastructure/adapters/mail-spool.ts`**: `resolveSpooled` and `discardSpooled` handle attachment files.
- **`src/infrastructure/adapters/template-registry.ts`**: maps a template name to a file path. It is kept as a leaf module with no `ejs` or `nodemailer` imports, and the mailer re-exports it so other callers import everything from this one file.
- **`src/infrastructure/adapters/logger.ts`**: used for the send and skipped-attachment logs.
- **`src/infrastructure/observability/tracer.ts`**: `withSpan` wraps the send.
- **`src/infrastructure/adapters/queue.ts`**: provides `EMAIL_QUEUE` and `EMAIL_URGENT_QUEUE`. The queue names live in the adapter so that producer and consumer agree and `infrastructure` does not import application code.
- **`src/infrastructure/adapters/job-dispatch.ts`**: `dispatchJob` is imported here, and `enqueueEmail` is described as the queued path.
- **`src/infrastructure/adapters/email.worker.ts`**: drains the queue. Its `discardJobAttachments` is named as the place that cleans up attachments for queued jobs.
- **Module callers** (`src/modules/account/emails.ts`, `src/modules/account/services/mail.ts`, `src/modules/account/services/reap-inactive.ts`) and the account contract tests are graph neighbors. `emails.ts` builds `EmailContent` values for controllers to pass to `enqueueEmail`.
- **`src/app/boot-rendering.ts`**: a graph neighbor. The visible content does not show how it interacts with this file.

## Notes
- Prefer `enqueueEmail` on request paths so a slow SMTP server cannot stretch an HTTP response. `sendTemplatedEmail` blocks until the transport accepts the message.
- Templates use root-relative includes (`/shared/templates/layouts/...`), which resolve against `process.cwd()`.
- Templates receive only `data`, with no locale lookup. Producers translate every string before the request ends.
- The `template` name is shared with the demo outbox and the paired frontend's e2e specs, so it must not include an extension.
- The OTel import uses the `/incubating` subpath, because the older `SEMATTRS_*` aliases are deprecated.
