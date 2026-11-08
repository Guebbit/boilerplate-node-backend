---
source: src/infrastructure/adapters/smtp-transport.ts
sha256: 2b3724862934944bcee0f9d0937cf4f2dee2dba87b9e10dc9867478b4281f1a3
generated_at: 2026-11-08T03:23:49.437384+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/smtp-transport.ts

## Purpose

Lazily builds and memoizes a nodemailer SMTP transporter, then exposes a `sendBySmtp` function to render and send an `OutgoingMail` through it. The file exists in isolation (separate from `mail-transports.ts`) so that the early-loading modules (jest setup, dev preload) never pull in the `nodemailer` package, preserving testability of `jest.mock('nodemailer')`.

## Key elements

- **`transport`** (module-level `let`) — the memoized `Transporter`; created once on first send, reused thereafter.
- **`resetTransporter()`** — exported test seam; clears the memoized transporter so a suite that mutates SMTP env config can get a fresh one without re-importing the module.
- **`getTransporter()`** (private) — builds the transporter via `createTransport` on first call. Reads `mailConfig()` for host, port, name, and credentials. Derives `secure` (465 → implicit TLS) and `requireTLS` (587 → STARTTLS) from the port. Sets `disableFileAccess` and `disableUrlAccess` to block path/URL exfiltration from attachments.
- **`sendBySmtp(mail: OutgoingMail)`** — exported entry point; calls `mail.render()` then passes the finished message to the transporter's `sendMail`. Returns `Promise<SentMessageInfo>`.

## Relationships

- **`./config`** — imports `mailConfig`, the single source for SMTP host/port/name/user/pass values.
- **`./mail-transports`** — imports the `OutgoingMail` type. The separation from this file is deliberate: `mail-transports.ts` is imported before the app boots (jest setup, dev preload) and must not transitively load nodemailer.
- **`tests/unit/infrastructure/adapters/mailer-transport.test.ts`** — exercises `sendBySmtp` and `resetTransporter`; relies on the memoization + reset pattern to swap SMTP configurations between test cases.

## Notes

- Port comparison for `secure` is numeric (`port === 465`), so a zero-padded env value like `"0465"` still resolves correctly and won't silently open a plaintext connection.
- `requireTLS` is set only for port 587, preventing a man-in-the-middle from stripping the STARTTLS advertisement and capturing AUTH credentials.
- Auth credentials default to empty strings when unset; nodemailer then attempts an unauthenticated send, surfacing the failure at send time rather than at boot (email is not a hard startup dependency).
- The transporter is **not** torn down automatically — long-lived processes hold the connection for the process lifetime.
