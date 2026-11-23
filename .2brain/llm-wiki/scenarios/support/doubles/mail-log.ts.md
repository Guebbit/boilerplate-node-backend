---
source: scenarios/support/doubles/mail-log.ts
source_sha256: db1146fb44b2a1a074391174fc2a03954f1c3317a5e32ba143b475a988a70aca
context_sha256: 7b647c5f1bca00d005f5c88d7ef3b28aac8f1a4dbfdb590c00d7cf3699a6d654
generated_at: 2026-11-22T01:47:11.226105+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/support/doubles/mail-log.ts

## Purpose
Defines the `log` mail transport, a test double that is never shipped. It renders the message, so a broken template still fails where it is sent, but opens no socket. nodemailer's `jsonTransport` returns the message as JSON instead of delivering it.

## Key elements
- `logMailTransport: MailTransportAdapter`: the only export.
  - `delivers: () => false`: reports that mail sent through it reaches nobody.
  - `send(mail)`: awaits `mail.render()` and a dynamic `import('nodemailer')` in parallel. It then calls `nodemailer.createTransport({ jsonTransport: true, disableFileAccess: true, disableUrlAccess: true }).sendMail(message)`.

## Relationships
- `src/infrastructure/adapters/mail-transports.ts`: provides the `MailTransportAdapter` type this object implements. The file imports it with `import type`.
- `scenarios/support/doubles/register.ts`: registers this transport (per the module doc).
- `tests/unit/infrastructure/adapters/mailer-transport.test.ts`: a neighbor in the graph. The file content doesn't show how it uses this module.

## Notes
- `delivers` is `false`, so a boot check or second factor that depends on a person reading mail must not count this transport.
- `nodemailer` is imported inside `send`, not at the top of the file. The jest setup loads this file before a test's own `jest.mock('nodemailer')` is hoisted. A top-level import would give that test an already-evaluated copy that can't be mocked.
- `disableFileAccess` and `disableUrlAccess` match the SMTP transport's settings, so a path or URL in a message is refused.
