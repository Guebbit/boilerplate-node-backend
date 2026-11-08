---
source: scenarios/support/doubles/mail-log.ts
sha256: 0d63132851eb4af1e5f8aab2728639f7e1b0f797c0df2f2e7ab23c56ac357f7f
generated_at: 2026-11-08T02:33:24.654243+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/mail-log.ts

## Purpose

Test double for the mail transport adapter. It renders a message (so template errors surface at send-time) but opens no socket — nodemailer's `jsonTransport` serialises the message to a JSON string and returns it. It exists so integration/e2e tests can exercise the mail-sending code path without a real SMTP server.

## Key elements

- **`logMailTransport: MailTransportAdapter`** — the sole export. An object implementing the `MailTransportAdapter` interface with two members:
  - `delivers()` — always returns `false`. Signals to callers that no human will actually receive the mail (boot checks, 2FA flows, etc. must not rely on it).
  - `send(mail)` — renders the message via `mail.render()`, then sends it through a nodemailer transport configured with `jsonTransport: true`, `disableFileAccess: true`, and `disableUrlAccess: true`. Returns the resolved JSON string rather than a delivery receipt.

## Relationships

- **`src/infrastructure/adapters/mail-transports.ts`** — provides the `MailTransportAdapter` type that `logMailTransport` implements. The double is a conforming substitute for the real SMTP adapter.
- **`scenarios/support/doubles/register.ts`** — imports and registers `logMailTransport` into the test double registry so test scenarios can swap it in as the active mail transport.
- **`tests/unit/infrastructure/adapters/mailer-transport.test.ts`** — unit-tests that exercise (or mock) this transport's behaviour.

## Notes

- **Lazy `import('nodemailer')`** — the module is imported inside `send()`, not at the top of the file. Jest's module registry loads this file *before* a test's `jest.mock('nodemailer')` is hoisted; a top-level import would capture an already-evaluated, un-mockable reference.
- **`delivers: () => false` is load-bearing** — any downstream logic that branches on "did the mail actually reach a person" (e.g. account-activation verification) will take the "not delivered" path. Do not remove or flip it without auditing those branches.
- **`disableFileAccess` / `disableUrlAccess`** mirror the production SMTP adapter's hardening; a template that accidentally references a `file:` or `http:` URL will fail in tests the same way it would in production.
