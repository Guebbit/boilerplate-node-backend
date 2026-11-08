---
source: tests/unit/infrastructure/adapters/mailer-dispatch.test.ts
sha256: 1dd2873505e8d4f47c34ce901fbfbd9eb5c9b49717c0b9a498dee02c86027d45
generated_at: 2026-11-08T10:08:42.814389+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mailer-dispatch.test.ts

## Purpose

Unit tests for the `enqueueEmail` dispatch function in `mailer.ts`, pinning the queue-or-send-inline contract: which branch runs, the payload shape handed to the broker, priority passthrough, logging level, the `Promise<void>` return on every path, and the spooled-attachment lifecycle that differs between the queued and inline paths.

## Key elements

- **Path 1 (publish resolves `true`):** verifies the job is published once, no inline send occurs, priority defaults to `'normal'` or passes through an explicit `'high'`, the payload carries `templateName` + raw `data` (no rendered HTML), and the log level is `debug`.
- **Path 2 (publish resolves `false`):** verifies the publish is still attempted (no pre-check), the inline fallback fires, no `debug` enqueue log is emitted, and the function resolves `undefined`.
- **Publish rejection path:** confirms `enqueueEmail` catches, logs `error` with template + recipient, resolves `undefined` (not a rejection), and does *not* attempt an inline send.
- **Mutual-exclusivity table test:** `it.each` over both publish outcomes asserts exactly one delivery attempt total.
- **Attachment spooling tests:** real temp-dir spooled files (via `spoolAttachment`) are used to verify that inline paths delete the spooled file after settling, the queued path leaves it intact for the consumer, and an inline SMTP failure still discards the file and logs.
- **Mocks:** `nodemailer` (sendMail), `@infrastructure/adapters/queue` (publishToQueue), and `@infrastructure/adapters/logger` (getter-based, see Notes).
- **Fixtures:** `REQUEST`, `TEMPLATE`, `DATA` constants; `spoolRoot` temp directory created/destroyed per test via `mkdtemp`/`rm`.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — module under test; imports `enqueueEmail`.
- **`src/infrastructure/adapters/mail-spool.ts`** — imports `spoolAttachment` to create real spooled files for the attachment-lifecycle tests (not mocked).
- **`src/types/index.ts`** — imports the `EmailJobPayload` type used to shape the `REQUEST` fixture.
- **`tests/support/environment.ts`** — calls `setEnvironment` to point `NODE_MAIL_SPOOL_PATH` at the per-test temp dir.
- **`tests/support/file-sandbox.ts`** — uses `fileExists` to assert on-disk state of spooled attachments.
- **`tests/unit/infrastructure/adapters/queue.test.ts`** — sibling test that pins `publishToQueue`'s own contract (resolves `false` when unconfigured, never rejects); this file's header explicitly delegates that proof to `queue.test.ts` rather than re-proving it.

## Notes

- **Logger mock uses getters, not a plain property.** `jest.mock` factories are hoisted; under swc (ESM-style hoisting) the factory executes before the `loggerMock` `const` is initialised, so a direct `logger: loggerMock` reference would throw a TDZ error. A getter defers the read to property-access time, by which point the `const` exists under either tsc or swc. The `nodemailer` and `queue` mocks are safe because their bodies reference the mock variable from inside a function, not at object-literal top level.
- **Templates render for real on the inline path.** Only the SMTP transport is mocked; EJS interpolation actually runs, so a missing `DATA` variable surfaces as a `ReferenceError` rather than a silently blank line in the output.
- **`enqueueEmail` always resolves `undefined`.** Tests explicitly assert `resolves.toBeUndefined()` to prevent callers from accidentally depending on a `SentMessageInfo` that only exists on one branch.
- **The inline path has no retry chain.** The file's trailing comment notes that `sendTemplatedEmail` itself "never discards any more" on the queued path (see `mailer-attachments.test.ts`, `email.worker.test.ts`), but the inline fallback is best-effort: on failure it discards the attachment, logs, and resolves.
