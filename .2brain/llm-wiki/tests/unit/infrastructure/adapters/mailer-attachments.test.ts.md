---
source: tests/unit/infrastructure/adapters/mailer-attachments.test.ts
sha256: 9dfe58499f9c86d2216292cf832fc762e7946986cc7c7563e15c6b17c28b9815
generated_at: 2026-09-23T20:18:34.297325+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mailer-attachments.test.ts

## Purpose

Unit tests for the attachment-resolving half of `nodemailer()` in the mailer adapter. Verifies that `{ filename, key }` attachment references are resolved to `{ filename, path }` via the mail spool, that absent/unresolvable attachments are omitted rather than passed as broken paths, and that `nodemailer()` itself never deletes the spooled file after a send.

## Key elements

- **`sendMailMock`** — `jest.fn()` standing in for nodemailer's `sendMail`; used to inspect the exact payload handed to the transport.
- **`jest.mock('nodemailer', …)`** — replaces the real transport with a single object exposing `sendMail`.
- **`DATA`** — dummy template variables satisfying the `orders.order-confirm` render signature; not asserted on.
- **`fileExists(target)`** — tiny `stat`-based helper returning a boolean for disk-existence checks.
- **`beforeEach` / `afterEach`** — creates a per-test temp spool directory (`mkdtemp`), sets `NODE_MAIL_SPOOL_PATH`, clears mocks, calls `resetTransporter()`, and restores the original env var / removes the temp dir on teardown.
- **`describe('nodemailer — resolving attachments')`** — three tests:
    - resolved path is `path.join(spoolRoot, key)`, never the raw key
    - no `attachments` property is present when the request has none
    - an unresolvable key (path-traversal string) results in no `attachments` property rather than a broken path
- **`describe('nodemailer — never discards its own attachment')`** — asserts the spooled file still exists on disk after a successful send; guards the invariant that only a job-finished caller may delete.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — source under test. Imports `nodemailer` (the function) and `resetTransporter` (test-utility for re-creating the mocked transport).
- **`src/infrastructure/adapters/mail-spool.ts`** — imports `spoolAttachment` to write real bytes into the temp spool so the resolver has a valid file to find.

## Notes

- This file deliberately does **not** test spool-file deletion. That responsibility belongs to the dispatch/worker layer; the complementary coverage lives in `mailer-dispatch.test.ts` and `email.worker.test.ts`.
- The unresolvable-key test uses `'../../etc/passwd'` as the key — it exercises the spool's path-resolution rejection, not an actual filesystem attack vector.
- `nodemailer` is mocked at module level; `resetTransporter()` in the SUT re-invokes `createTransport`, so every test gets a clean `sendMail` call history.
