---
source: src/infrastructure/adapters/smtp-transport.ts
source_sha256: 9e3f5f6b20d604302d0c78d149817dd152152123c8abecda06fa2596102658f6
context_sha256: a7b19d70651ac090532dc40e042c633a7e63f73980747a072613cace46afc35d
generated_at: 2026-11-22T02:42:35.874177+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/smtp-transport.ts

## Purpose
Sender for the `smtp` mail transport. It builds a nodemailer SMTP client on first use, reuses it, and sends rendered mail through it. It lives in its own file so `./mail-transports` never imports nodemailer. `./mail-transports` is loaded early by the jest setup and the development doubles, and a test's own `jest.mock('nodemailer')` must still take effect.

## Key elements
- `sendBySmtp(mail)`: the only send entry point. It awaits `mail.render()`, then passes the finished message to `getTransporter().sendMail(...)`. It resolves with nodemailer's `SentMessageInfo` receipt.
- `getTransporter()`: private and lazy. It reads `mailConfig()` on first call, builds the transporter with `createTransport`, and memoises it in a module-level variable.
- `resetTransporter()`: test seam that clears the memoised transporter. The next send rebuilds it from the current environment.
- `SMTP_TIMEOUT_MS` (10 000 ms): used for `connectionTimeout`, `greetingTimeout` and `socketTimeout`. It replaces nodemailer's much longer defaults, so a hung server does not hold a worker slot or a job's 60 s claim. A timeout throws, so the job is retried like any other transient failure.

## Relationships
- `./config`: `mailConfig()` supplies `NODE_SMTP_HOST`, `NODE_SMTP_PORT`, `NODE_SMTP_NAME`, `NODE_SMTP_USER` and `NODE_SMTP_PASS`.
- `./mail-transports`: this file imports the `OutgoingMail` type from it, and only as a type. That is how the dependency stays one-way and nodemailer stays out of `mail-transports`.
- `tests/unit/infrastructure/adapters/mailer-transport.test.ts`: the related unit test. The `resetTransporter` seam exists so suites that vary SMTP configuration can get a fresh transporter without resetting the module registry.

## Notes
- `secure` is `port === 465` (implicit TLS). `requireTLS` is `port === 587`, which refuses to continue without STARTTLS. The port is compared as a number, so a zero-padded `0465` cannot be misread as non-465.
- `disableFileAccess` and `disableUrlAccess` are both `true`. An attachment or part with a `path` or `href` is refused, so message data cannot read local files or fetch URLs.
- Unset host, name, user and password fall back to empty strings. The comment says a host without credentials is refused at boot (`SMTP_COMPANIONS` in the config module), so the empty-string credentials only apply when no SMTP host is selected.
- The transporter is built once and cached. Changing the environment afterwards has no effect until `resetTransporter()` is called.
