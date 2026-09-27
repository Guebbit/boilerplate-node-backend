---
source: src/infrastructure/adapters/mailer.ts
sha256: f7d8dc889e9e1ffe6c9ec86a8ea85010331341c08f72eab08b05094a1cab912b
generated_at: 2026-09-27T14:07:07.827907+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/mailer.ts

## Purpose

Email delivery adapter that renders EJS templates and sends mail via SMTP (nodemailer), with optional queue-based delivery to decouple slow mail servers from request paths. It also supports two non-SMTP transports (`log`, `outbox`) for tests and the demo profile, so no caller needs to branch on deployment mode.

## Key elements

- **`emailTemplatesDirectory()`** – Resolves the absolute path to EJS templates (`NODE_EMAIL_TEMPLATES_DIR` or `shared/templates/emails`).
- **`templateFile(name)`** – Maps a template identifier to its `.ejs` file path; the single place the extension is appended.
- **`MailTransport`** (`'smtp' | 'log' | 'outbox'`) – The three delivery modes this adapter supports.
- **`resolveMailTransport()`** – Determines the active transport per send. Forces `outbox` in demo mode, `log` in test; otherwise reads `NODE_MAIL_TRANSPORT` (default `smtp`). Throws if `outbox` is selected in production.
- **`missingSmtpCompanions()`** – Returns unset `NODE_SMTP_USER`/`PASS`/`SENDER` vars when a host is configured; called by the boot gate.
- **`resetTransporter()`** – Clears the memoised nodemailer transport (test seam for varying SMTP config without re-importing the module).
- **`getTransporter()`** (internal) – Lazily builds and caches a nodemailer `Transporter` with TLS/port logic (`secure` on 465, `requireTLS` on 587).
- **`resolveAttachments()`** (internal) – Resolves spooled `{filename, key}` pairs into nodemailer `{filename, path}` via `resolveSpooled`.
- **`send(message)`** (internal) – The single `sendMail` call site; hands a fully-built envelope to the transporter.
- **`sendTemplatedEmail(request)`** – Renders an EJS template, fills in `from`/`html`/attachments, and sends synchronously.
- **`enqueueEmail(...)`** – Publishes an `EmailJobPayload` to the `EMAIL_QUEUE` RabbitMQ queue for async delivery (see `email.worker.ts` as consumer).

## Relationships

- **`src/app/required-config.ts`** – Calls `missingSmtpCompanions()` as a boot-time gate; the adapter does not call back into the app.
- **`src/infrastructure/adapters/queue.ts`** – Imports `publishToQueue`, `EMAIL_QUEUE`, and `JobPriority` to enqueue mail for async delivery.
- **`src/infrastructure/adapters/email.worker.ts`** – Consumes jobs published to `EMAIL_QUEUE`; owns attachment discard (`discardSpooled`) after a job's retry chain is exhausted.
- **`src/infrastructure/adapters/mail-spool.ts`** – Provides `resolveSpooled` / `discardSpooled` for attachment file paths.
- **`src/infrastructure/adapters/demo-outbox.ts`** – `recordDemoEmail` is called when transport is `outbox`, storing the rendered message for `GET /__test/emails`.
- **`src/infrastructure/adapters/logger.ts`** – Emits warnings (e.g., unresolvable spool keys).
- **`src/infrastructure/observability/tracer.ts`** – `withSpan` wraps send operations with OTel messaging attributes.
- **`src/infrastructure/runtime/environment.ts`** – `environmentNumber` / `environmentChoice` read `NODE_SMTP_PORT`, `NODE_MAIL_TRANSPORT`.
- **`src/infrastructure/runtime/demo-profile.ts`** – `isDemoMode()` forces `outbox` transport unconditionally.
- **`src/modules/account/services/mail.ts`** – Application-layer service that calls `sendTemplatedEmail` / `enqueueEmail`.
- **`src/modules/account/two-factor/registry.ts`** – Gates the email second factor on `NODE_SMTP_HOST` being set.
- **`src/modules/account/emails.ts`** – Defines email content/template names that flow through this adapter.
- **`scripts/ops/reap-inactive-accounts.ts`** – Ops script that triggers account-related emails through the same path.

## Notes

- The transporter is **lazily memoised** at module scope (not at import time), so tests can call `resetTransporter()` after mutating env vars without a full module re-import.
- `secure` is derived from **numeric** port comparison (`port === 465`), not string equality, to avoid a zero-padded `"0465"` accidentally disabling TLS.
- `requireTLS` is set on port 587 to prevent credential-leak via STARTTLS-advertisement stripping.
- The adapter **never discards** spooled attachments itself; only `email.worker.ts` (after final retry) and the inline `enqueueEmail` path own that lifecycle, because a queued job may be retried and still need the file.
- Template names travel over RabbitMQ as bare filenames (no absolute path), keeping the producer and consumer decoupled from each other's filesystem layout.
- The `createTransport` call is split into two branches rather than a ternary argument because nodemailer's overloads are per-transport-kind and a union argument matches neither.
