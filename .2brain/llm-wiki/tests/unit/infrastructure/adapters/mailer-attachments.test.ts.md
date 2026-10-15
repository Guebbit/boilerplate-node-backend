---
source: tests/unit/infrastructure/adapters/mailer-attachments.test.ts
sha256: 8cf670b26782cd8871b4546440ec7cb52a2fd3b576e2741b785fcd9fb7a58475
generated_at: 2026-10-15T13:07:31.559295+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mailer-attachments.test.ts

## Purpose

Unit test that exercises the attachment-resolving half of `sendTemplatedEmail()`: it drives real spooled files end to end and asserts how `request.attachments` (`{ filename, key }`) get turned into nodemailer's `{ filename, content }` form. It is the dedicated test for this concern; `mailer-dispatch.test.ts` covers queue/inline routing without attachments, and `email.worker.test.ts` covers the callers that delete spooled files after a job finishes.

## Key elements

- **`sendMailMock`** — a `jest.fn()` standing in for nodemailer's transport `sendMail`; all assertions read from `sendMailMock.mock.calls`.
- **`jest.mock('nodemailer', …)`** — intercepts `createTransport` so no real SMTP connection is made.
- **`spoolAttachment`** (imported from `mail-spool.ts`) — writes a `Buffer` to a temp spool directory and returns the opaque key used in test fixtures.
- **`DATA`** — minimal shape required by the `account.reset-confirm.ejs` template; irrelevant to assertions.
- **`describe('resolveAttachments — resolving attachments')`** — four cases:
  - Resolved attachment carries `content: Buffer`, never a filesystem path or spool key.
  - Forged extra fields (`from`, `cc`, `bcc`, `headers`, `envelope`) on the request object do not leak into the nodemailer call.
  - No `attachments` property is passed to nodemailer when the request names none.
  - An unresolvable key (e.g. `../../etc/passwd`) is silently dropped rather than forwarded as a broken path.
- **`describe('sendTemplatedEmail — never discards its own attachment')`** — asserts the spooled file still exists on disk after a successful send, protecting retried jobs from losing their attachment.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — module under test; provides `sendTemplatedEmail`.
- **`src/infrastructure/adapters/mail-spool.ts`** — provides `spoolAttachment`, used to create the on-disk fixture each test resolves.
- **`tests/support/environment.ts`** — `setEnvironment` sets `NODE_MAIL_SPOOL_PATH` to a per-test temp directory.
- **`tests/support/file-sandbox.ts`** — `fileExists` is the assertion helper that confirms the spooled file was *not* deleted.

## Notes

- Each test gets its own `mkdtemp` spool root (cleaned up in `afterEach`), so tests are fully isolated and order-independent.
- The "forged job" test deliberately stuffs disallowed keys into the request object and holds them in a variable to avoid TypeScript excess-property errors at compile time; the assertion is purely runtime.
- The "never discards" case is a regression guard for a specific failure mode: if a prior retry attempt deleted the spooled file, the next attempt would resolve an empty attachment. Only the top-level caller (queue/worker) owns deletion.
- `mailer-dispatch.test.ts`'s `sendInline` cases and `email.worker.test.ts` are the only places that test the deletion side; do not add deletion assertions here.
