---
source: tests/unit/infrastructure/adapters/mailer-attachments.test.ts
sha256: 0b3f2c76f99e60a87e741ad9a54b0bacfcd2b1c6e2e9feabed3d212aadf6d359
generated_at: 2026-09-27T16:04:19.015421+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mailer-attachments.test.ts

## Purpose

Verifies that `sendTemplatedEmail()` correctly resolves `{ filename, key }` attachment references from the mail spool into nodemailer-ready `{ filename, path }` objects, and that the spooled file is never deleted by the send path itself (only the job-finished caller may discard it). This is the dedicated end-to-end test for the attachment-resolving half; `mailer-dispatch.test.ts` covers queue/inline routing without attachments.

## Key elements

- **`sendMailMock`** – Jest mock standing in for `nodemailer.createTransport().sendMail`; used to inspect exactly what nodemailer receives.
- **`DATA`** – Static shape satisfying the `orders.order-confirm.ejs` template; values are irrelevant to assertions.
- **`spoolRoot` / `beforeEach` / `afterEach`** – Creates a per-test temp dir under `tmpdir()`, points `NODE_MAIL_SPOOL_PATH` at it, and cleans up (restoring the original env value).
- **`describe('resolveAttachments — resolving attachments')`** – Three cases: (1) resolved `path` is the spool-joined key, never the raw key; (2) no `attachments` property when the request names none; (3) an unresolvable/traversal key (`../../etc/passwd`) is dropped entirely rather than passed to nodemailer.
- **`describe('sendTemplatedEmail — never discards its own attachment')`** – After a successful send, the spooled file still exists on disk. Guards against a retry chain resolving a key the first attempt already deleted.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** – Under test. `sendTemplatedEmail` is the entry point; `resetTransporter` is called in `beforeEach` to reset the mocked transport between tests.
- **`src/infrastructure/adapters/mail-spool.ts`** – `spoolAttachment` writes a buffer to the spool dir and returns the key that the test then passes into the attachment request.
- **`tests/support/file-sandbox.ts`** – `fileExists` is used in the "never discards" assertion to confirm the spooled file is still on disk after the send resolves.

## Notes

- The nodemailer mock is registered via `jest.mock` *before* importing the module under test; the mock transport's `sendMail` is cleared and re-resolved to `{ messageId: 'smtp-1' }` in every `beforeEach`.
- The "unresolvable key" case uses a path-traversal string (`../../etc/passwd`); the expected behavior is silent omission (no `attachments` property), not an error thrown to the caller.
- The file explicitly does **not** assert that the spooled file is deleted; that responsibility belongs to the queue/worker callers (see `mailer-dispatch.test.ts`, `email.worker.test.ts`).
