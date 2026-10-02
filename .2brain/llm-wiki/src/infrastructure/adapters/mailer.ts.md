---
source: src/infrastructure/adapters/mailer.ts
sha256: 0e544f706acc187d8297c121347c8752240941925888e55f3f4723221ccac03f
generated_at: 2026-10-01T12:49:49.437961+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/mailer.ts

## Purpose

Email delivery adapter that renders EJS templates into HTML and sends the result via SMTP (or a non-SMTP transport for testing/demo). It is the single module every caller goes through to render a template and hand the finished message to a transport, optionally via the queue to keep HTTP responses fast.

## Key elements

- **`MailTransport`** (`'smtp' | 'log' | 'outbox'`) — the three ways a deployment can handle an email; there is deliberately no `'none'` because rendering is where template bugs surface.
- **`resolveMailTransport()`** — returns the active transport. Hard-forces `'log'` in test environments; rejects `'outbox'` outside relaxed (dev/test) environments.
- **`resetTransporter()`** — test seam that clears the memoised `Transporter` so a suite can vary SMTP env vars and get a fresh one without re-importing the module.
- **`getTransporter()`** (private) — lazily builds and caches the nodemailer transport. Derives `secure`/`requireTLS` from the port number (465 → implicit TLS; 587 → STARTTLS required; 25 → relay).
- **`resolveAttachments()`** (private) — maps `EmailJobPayload` attachment `{filename, key}` pairs to nodemailer `{filename, path}` by resolving each key through the mail spool; unresolvable keys are logged and skipped.
- **`send()`** (private) — the single `sendMail` call site; all outbound messages route through here.
- **`sendTemplatedEmail(request, templateName, data)`** — public entry point. Short-circuits to `recordDemoEmail` when transport is `'outbox'`. Otherwise renders the EJS template, resolves spooled attachments, fills `from`/`html` defaults, and sends. Wraps the whole operation in an OTel `email.send` span with `messaging.system` and `email.template` attributes (never the recipient).
- **Re-exports from `template-registry`** — `registerTemplateDirectories`, `templateFile`, `registeredTemplateNames` are re-exported so every other caller keeps importing from this one file (the mail adapter's public surface).
- **`ResolvedAttachment`** — local interface matching nodemailer's `{filename, path}` shape.

## Relationships

- **`template-registry.ts`** — provides the EJS template lookup (`templateFile`) and registration functions; re-exported here to keep a single public import path.
- **`config.ts`** (`mailConfig`) — supplies all SMTP connection parameters (`NODE_SMTP_HOST`, `PORT`, `USER`, `PASS`, `NAME`) and the `NODE_MAIL_TRANSPORT` setting.
- **`runtime/config.ts`** — `isTestEnvironment` and `isRelaxedEnvironment` gate transport resolution.
- **`demo-outbox.ts`** — `recordDemoEmail` is called when the transport is `'outbox'`; the outbox is the demo profile's read-only control surface.
- **`mail-spool.ts`** — `resolveSpooled` turns spool keys into filesystem paths for attachments; `discardSpooled` is called by the worker (not here) when a job's retry chain is exhausted.
- **`tracer.ts`** — `withSpan` wraps the send operation for OpenTelemetry.
- **`queue.ts`** — `publishToQueue` and `EMAIL_QUEUE` are used by `enqueueEmail` (further down in the file) to defer delivery off the request path.
- **`logger.ts`** — emits the warning when a spool key fails to resolve.
- **`email.worker.ts`** — the consumer that drains the email queue; it owns attachment disposal (`discardJobAttachments`) after the final retry, which is why `sendTemplatedEmail` never discards spooled files itself.
- **`modules/account/services/mail.ts`** / **`modules/account/emails.ts`** — application-level callers that build `EmailJobPayload` and invoke `sendTemplatedEmail` or `enqueueEmail`.
- **`scripts/ops/reap-inactive-accounts.ts`** — operational script that sends lifecycle emails through the same adapter.

## Notes

- **`secure` is compared as a number** (`port === 465`), not a string, so a zero-padded env value like `0465` still resolves correctly.
- **`requireTLS: true` on port 587** is intentional: without it an attacker who strips the STARTTLS advertisement would receive AUTH credentials in cleartext.
- **No `'none'` transport exists by design.** Skipping render to "disable" email would hide template bugs; use `'log'` instead.
- **`sendTemplatedEmail` is synchronous** (the promise settles only after the server accepts). Callers on HTTP paths should prefer `enqueueEmail` to avoid stretching the response with a slow SMTP server.
- **Attachments are never deleted inside this module.** Only the worker (after final retry) or the inline path in `enqueueEmail` calls `discardSpooled`, because a queued job may still have retries that need the file.
- **OTel span attributes deliberately omit the recipient** — tracing backends do not apply the logger's personal-field redaction.
- The `template-registry` re-export exists because `tests/support/setup.ts` must not transitively pull `ejs`/`nodemailer` through the registry module; keeping the re-export here preserves that boundary.
