---
source: tests/unit/infrastructure/adapters/mailer-dispatch.test.ts
sha256: bbe4104938404372db3a5d0d3651d7dd6bd059c29cf003c3d2f9d39bbdae5fe4
generated_at: 2026-10-15T13:07:48.952731+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mailer-dispatch.test.ts

## Purpose

Unit tests for the `enqueueEmail` dispatch logic in `mailer.ts`. Verifies the two-branch contract (publish-to-queue vs. inline send), their mutual exclusivity, the error path where `publishToQueue` rejects instead of resolving `false`, and attachment-spool cleanup on the inline path. Exists because `enqueueEmail` resolves `void` on every path, so a broken dispatch is silently invisible to callers.

## Key elements

- **`sendMailMock` / `publishToQueueMock` / `loggerMock`** — jest module mocks for `nodemailer`, `@infrastructure/adapters/queue`, and `@infrastructure/adapters/logger` respectively. The logger mock uses **getters** (not direct property values) to survive swc's ESM-import hoisting past the `const` declaration.
- **`REQUEST`, `TEMPLATE`, `DATA`** — shared fixtures: a password-reset email request, the EJS template name, and the full data object the template interpolates.
- **`spoolRoot`** — a per-test `mkdtemp` directory wired in via `setEnvironment({ NODE_MAIL_SPOOL_PATH })`; used to verify attachment files are (or are not) cleaned up.
- **`describe` blocks (one per scenario group):**
  - *path 1 (publish → true):* publishes exactly once, does **not** send inline, defaults to `'normal'` priority, passes explicit priority through, carries template name + raw data (no rendered HTML), logs at `debug`.
  - *path 2 (publish → false):* still calls `publishToQueue`, falls back to inline send, does not log an enqueue, resolves `undefined`.
  - *publish rejects:* logs `error` with template + recipient, resolves `undefined`, does **not** attempt inline send.
  - *mutual exclusivity (table):* exactly one of {enqueued, sent-inline} equals 1.
  - *inline attachment discard:* inline paths delete the spooled file after settle; queued path leaves it in place (consumer owns it).

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — module under test; imports `enqueueEmail`.
- **`src/infrastructure/adapters/mail-spool.ts`** — imports `spoolAttachment` to create real temp files for the attachment-cleanup tests.
- **`src/types/index.ts`** — imports `EmailJobPayload` for type-annotating the `REQUEST` fixture.
- **`tests/support/environment.ts`** — calls `setEnvironment` to point `NODE_MAIL_SPOOL_PATH` at the per-test temp dir.
- **`tests/support/file-sandbox.ts`** — uses `fileExists` to assert attachment files were removed (or preserved).
- **`tests/unit/infrastructure/adapters/queue.test.ts`** — referenced in comments as the file that pins `publishToQueue`'s own contract (resolves `false` with no I/O when unconfigured; never rejects). This file deliberately does **not** re-test that behavior.

## Notes

- **Logger-mock getter trick:** `jest.mock` factories execute before module-level `const` initializers when swc hoists ESM imports to the top. Reading `loggerMock` directly in the factory body would throw `Cannot access before initialization`. Getters defer the read to property-access time, which is safe under both TS and swc transforms. The `nodemailer` and `queue` mocks are already safe because they access their variables from inside arrow functions, not at object-literal top level.
- **No `isQueueEnabled()` pre-check:** `enqueueEmail` always calls `publishToQueue`; the "broker unconfigured" case is handled inside that function (resolves `false`). This test file does not assert that internal behavior.
- **Inline path renders for real:** only the SMTP transport is mocked. A missing variable in `DATA` would surface as an EJS `ReferenceError` at test time, not as a silently blank email.
- **Return type is `Promise<void>` on both paths:** callers cannot (and should not) inspect a `SentMessageInfo`; this test pins that with `resolves.toBeUndefined()`.
