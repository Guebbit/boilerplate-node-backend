---
source: tests/unit/infrastructure/adapters/mailer-dispatch.test.ts
sha256: b12805b69837e31e2460bbfb7211b648b584990cd1457243fcdce970dc4515e5
generated_at: 2026-09-27T16:04:38.895892+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mailer-dispatch.test.ts

## Purpose

Unit tests for `enqueueEmail` in `mailer.ts`, pinning the queue-or-send-inline dispatch contract: when `publishToQueue` resolves `true` the email is enqueued (and **not** sent inline); when it resolves `false` the email is sent inline (and **not** enqueued). Also covers the edge case where publish rejects, mutual exclusivity of the two paths, and attachment lifecycle on each path. The file exists because `enqueueEmail` resolves `void` on every path, so a broken dispatch is invisible to callers—these tests are the only guard.

## Key elements

- **Path 1 suite** (`publish resolves true`) — asserts one `publishToQueue` call, zero `sendMail` calls, priority defaulting (`normal`) and pass-through (`high`), payload carries template name + raw data (no rendered HTML), and a `debug`-level log.
- **Path 2 suite** (`publish resolves false`) — asserts the publish is still attempted (no `isQueueEnabled` pre-check), inline send fires, no enqueue log, and the return value is `undefined` (shared `Promise<void>` contract).
- **Publish-rejects suite** — mock rejects with `Error('Channel closed')`; asserts `enqueueEmail` resolves (does not throw), logs an `error` with template + recipient, and does **not** attempt inline fallback.
- **Mutual-exclusivity table** — `it.each` over both outcomes asserting `enqueued + sentInline === 1`.
- **Attachment-discarding suite** — uses `spoolAttachment` to create a real spool file, then verifies it is deleted on both inline paths (publish-false and inline-send-reject) but left intact on the queued path (which has a downstream retry chain).
- **`sendMailMock` / `publishToQueueMock` / `loggerMock`** — module-level jest mocks set up via `jest.mock` factories; logger uses **getter properties** to dodge a hoisting race (see Notes).
- **`beforeEach` / `afterEach`** — create a fresh temp dir via `mkdtemp`, set `NODE_MAIL_SPOOL_PATH`, clear all mocks; `afterEach` removes the dir and restores the original env value.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — SUT; `enqueueEmail` is the only import under test.
- **`src/infrastructure/adapters/mail-spool.ts`** — `spoolAttachment` is called in the attachment suites to produce a real spool key that `enqueueEmail`'s inline paths are expected to delete.
- **`src/types/index.ts`** — provides the `EmailJobPayload` type used to shape the `REQUEST` fixture.
- **`tests/support/file-sandbox.ts`** — `fileExists` is used to assert spool-file presence/absence after each path.
- **`@infrastructure/adapters/queue`** (mocked) — `publishToQueue` is the branch-deciding dependency; its boolean return drives which path executes.
- **`@infrastructure/adapters/logger`** (mocked) — assertions check which log level fired on each path.
- **`nodemailer`** (mocked) — `sendMail` is the inline-delivery sink; only the transport is mocked, EJS rendering runs for real.

## Notes

- **Logger mock uses getters, not a direct reference.** `jest.mock` factories are hoisted above all `const` declarations. Under swc (ESM-style import hoisting) the factory runs before `loggerMock` is initialised, so `logger: loggerMock` would throw a TDZ error. Getters defer access to property-read time, after the `const` is live. The `nodemailer` and `queue` mocks are safe because each accesses its variable from inside a function body, not at object-literal top level.
- **Inline paths render templates for real.** Only the SMTP transport is mocked; EJS interpolation executes. A missing `DATA` key surfaces as an `EJS ReferenceError` rather than a silently blank line in the output—useful for catching incomplete fixtures.
- **No `isQueueEnabled` pre-check is tested here.** The contract "unconfigured broker → `publishToQueue` resolves `false` with no I/O" is owned by `queue.test.ts`; this file only verifies the caller always calls `publishToQueue` and branches on the result.
- **Temp-dir isolation.** Each test gets its own `mkdtemp` directory for `NODE_MAIL_SPOOL_PATH`; `afterEach` removes it and restores (or deletes) the original env value. Tests must not assume a shared spool location.
- **Attachment test relies on `spoolAttachment` writing a real file** into the temp spool dir, so the discarding assertions are filesystem-level (`fileExists`), not mock-level.
