---
source: scenarios/support/doubles/mail-log.ts
sha256: 0d63132851eb4af1e5f8aab2728639f7e1b0f797c0df2f2e7ab23c56ac357f7f
generated_at: 2026-10-14T07:03:27.876088+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/mail-log.ts

## Purpose

A test-double mail transport used in scenario (integration) tests. It exercises the real message-rendering path (so a broken template still throws) but replaces network delivery with nodemailer's `jsonTransport`, so no socket is opened and no mail is actually sent. It exists so tests can verify the *sending* logic without depending on a live mail server.

## Key elements

- **`logMailTransport`** (`MailTransportAdapter`) — the sole export.
  - `delivers: () => false` — signals to callers that this transport never reaches a human; boot-checks or second-factor flows must not rely on it.
  - `send(mail)` — renders `mail` via `mail.render()`, then passes the rendered message through a nodemailer transport configured with `jsonTransport: true`. The result is a JSON string; no network I/O occurs.
  - `disableFileAccess: true` / `disableUrlAccess: true` — mirrors the production SMTP transport's guard rails so a malicious or buggy template is refused identically.

## Relationships

- **`src/infrastructure/adapters/mail-transports.ts`** — supplies the `MailTransportAdapter` type that `logMailTransport` satisfies.
- **`scenarios/support/doubles/register.ts`** — registers `logMailTransport` into the scenario's dependency-injection registry (noted in the file's module docstring).
- **`tests/unit/infrastructure/adapters/mailer-transport.test.ts`** — unit-tests the production mail transport; this double is its scenario-level counterpart (the dynamic `import('nodemailer')` in this file exists specifically so a `jest.mock('nodemailer')` in a unit test is not defeated by an already-evaluated top-level import here).

## Notes

- The `nodemailer` import is **dynamic** (`import('nodemailer')` inside `send`), not a top-level import. This is deliberate: Jest's setup loads this file before a test's own `jest.mock('nodemailer')` is hoisted; a static import would hand that test an already-evaluated, un-mockable copy.
- `delivers` returning `false` is a **contract**, not just a side effect. Any code path that gates a user on "they will receive a mail" must check this flag; counting this transport as a delivery is a bug.
- The transport is explicitly a test double ("never shipped") and lives under `scenarios/support/doubles/`, not under `src/`.
