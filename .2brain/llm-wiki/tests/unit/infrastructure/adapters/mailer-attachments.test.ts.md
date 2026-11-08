---
source: tests/unit/infrastructure/adapters/mailer-attachments.test.ts
sha256: a5c12eeea4b6e0bd1b91aec3733d4f151dbb2a0187f28ab1647f23bb92095c0f
generated_at: 2026-11-08T10:08:24.953899+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mailer-attachments.test.ts

## Purpose

Unit tests for the attachment-resolution half of `sendTemplatedEmail()`: verifying that spool-keyed attachment specs are resolved to real file content for nodemailer, that the mail-sending surface cannot be forged with extra envelope fields, and that the function itself never deletes a spooled file (deletion is the caller's job).

## Key elements

- **`sendMailMock`** – shared `jest.fn()` returned by the hoisted `jest.mock('nodemailer', …)` factory; all assertions inspect its call arguments.
- **`DATA`** – static placeholder object satisfying `account.reset-confirm.ejs` template variables; irrelevant to the assertions themselves.
- **`beforeEach` / `afterEach`** – create a unique temp dir (`mkdtemp`), point `NODE_MAIL_SPOOL_PATH` at it via `setEnvironment`, then recursively remove it.
- **`describe('resolveAttachments — resolving attachments')`** – six tests covering:
  - Attachment resolved to `{ filename, content: Buffer }` (never a raw path or spool key).
  - Forged `from`/`cc`/`bcc`/`headers`/`envelope` fields on the request are stripped; only named fields survive.
  - `replyTo` passthrough and fallback to `NODE_SUPPORT_EMAIL`.
  - `messageId` / `inReplyTo` / `references` set only when the producer supplies them.
  - No `attachments` key in the nodemailer payload when the request names none.
  - A path-traversal key (`../../etc/passwd`) is silently dropped rather than passed to nodemailer.
- **`describe('sendTemplatedEmail — never discards its own attachment')`** – asserts via `fileExists` that the spooled file is still on disk after a successful send, guarding retry scenarios.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** – imports `sendTemplatedEmail`, the system under test.
- **`src/infrastructure/adapters/mail-spool.ts`** – imports `spoolAttachment` to create real spool files for the tests.
- **`tests/support/environment.ts`** – imports `setEnvironment` to redirect `NODE_MAIL_SPOOL_PATH` into the per-test temp dir.
- **`tests/support/file-sandbox.ts`** – imports `fileExists` to assert the spooled file survives the send.

## Notes

- The nodemailer mock is registered via `jest.mock` with a factory *before* the `import` of `sendTemplatedEmail`, so the hoisted mock is in place when `mailer.ts` loads.
- The "forged job" test stores the malicious object in a local variable to sidestep TypeScript's excess-property check while still exercising the runtime guard.
- This file deliberately does **not** assert that spooled files are cleaned up; that contract is owned by the dispatch/worker callers (`mailer-dispatch.test.ts`, `email.worker.test.ts`).
- `fileExists` from `file-sandbox` is the only import from that module and is used solely in the final survival test.
