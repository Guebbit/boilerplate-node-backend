---
source: src/infrastructure/adapters/smtp-transport.ts
sha256: 2b3724862934944bcee0f9d0937cf4f2dee2dba87b9e10dc9867478b4281f1a3
generated_at: 2026-10-14T07:49:30.202474+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/smtp-transport.ts

## Purpose

Provides the SMTP sending path via a nodemailer `Transporter`. The file is deliberately isolated from `mail-transports.ts` so that the latter—loaded before the application by Jest setup and the dev preload—never imports `nodemailer`, allowing a test's own `jest.mock('nodemailer')` to take effect.

## Key elements

- **`transport`** (module-local) — Memoised `Transporter` instance, created once and reused across sends.
- **`resetTransporter()`** — Exports a test seam that clears the memoised transporter so a suite can vary SMTP config and get a fresh one without re-importing the module.
- **`getTransporter()`** (private) — Lazy singleton. Reads `mailConfig()` on first call, builds the transporter with the appropriate TLS settings, and caches it.
- **`sendBySmtp(mail: OutgoingMail): Promise<SentMessageInfo>`** — Public entry point. Calls `mail.render()`, passes the finished message to the transporter's `sendMail`, and returns the server's receipt.

## Relationships

- **`src/infrastructure/adapters/config.ts`** — Imports `mailConfig` to read `NODE_SMTP_HOST`, `NODE_SMTP_PORT`, `NODE_SMTP_NAME`, `NODE_SMTP_USER`, `NODE_SMTP_PASS`.
- **`src/infrastructure/adapters/mail-transports.ts`** — Imports the `OutgoingMail` type from there. Conversely, `mail-transports` does *not* import this file's `nodemailer` dependency, preserving the Jest-mock boundary.
- **`tests/unit/infrastructure/adapters/mailer-transport.test.ts`** — Exercises `sendBySmtp` and uses `resetTransporter` to swap the transporter between cases with different SMTP configurations.

## Notes

- **Lazy, not eager:** The transporter is built on first `sendBySmtp` call, not at module load. This defers environment reads and is what makes `resetTransporter` viable.
- **TLS logic:** `secure` is `true` only when port is exactly `465` (implicit TLS). `requireTLS` is `true` when port is `587` (STARTTLS), preventing a stripped-advertisement downgrade. The comparison is numeric (`port === 465`), so a zero-padded env value like `0465` still matches.
- **Security flags:** `disableFileAccess` and `disableUrlAccess` are set on the transporter so that a malicious `path` or `href` in an attachment cannot read local files or fetch URLs at send time.
- **Auth is best-effort:** Empty `user`/`pass` strings are passed through; nodemailer attempts an unauthenticated send and the server rejects at send time rather than failing at boot (email is not a hard startup dependency).
