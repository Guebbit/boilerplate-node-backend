---
source: tests/unit/infrastructure/adapters/mailer-dispatch.test.ts
sha256: 5c2b14d75a8c9d835f7fedf7baa6c225e12f7cfc0cc96865dcefb524d550b2f3
generated_at: 2026-09-23T20:18:50.900581+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mailer-dispatch.test.ts

## Purpose

Unit tests for `enqueueEmail` in `mailer.ts`, covering the three-branch dispatch decision (no broker → send inline; broker OK → enqueue only; broker publish fails → fall back to inline) plus two edge cases: a *rejecting* publish (contract violation, not a designed path) and attachment cleanup on inline sends. The file exists because the three-branch behavior was previously unasserted and a silent drop in any branch would be invisible to callers (the function always resolves `void`).

## Key elements

- **`sendMailMock` / `nodemailer` mock** — stubs the SMTP transport so inline sends are observable but no real mail is sent.
- **`publishToQueueMock` / `isQueueEnabledMock` / queue mock** — stubs the broker adapter; tests drive each branch by flipping `isQueueEnabled` and the publish return value.
- **Logger mock (getter-based)** — `jest.mock('@infrastructure/adapters/logger', …)` uses `get logger()` / `get auditLogger()` accessors rather than a plain property, so the factory does not read `loggerMock` before its `const` is initialised under swc's ESM-hoisting transform.
- **`beforeEach` / `afterEach` (spool lifecycle)** — creates a fresh `mkdtemp` directory, sets `NODE_MAIL_SPOOL_PATH`, and tears it down (restoring the original env value).
- **`DATA: Data`** — full EJS template data object; templates render for real (only the SMTP layer is mocked), so a missing variable surfaces as an EJS `ReferenceError` rather than a blank line.
- **`describe` blocks** — one per path (no-broker, publish-OK, publish-fails, publish-rejects), a mutual-exclusivity `it.each` table, and attachment-discard tests.
- **`fileExists` helper** — thin wrapper over `stat` used by the (truncated) attachment tests.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — the module under test; the file imports `enqueueEmail` and exercises every branch of its dispatch logic.
- **`src/infrastructure/adapters/mail-spool.ts`** — imports `spoolAttachment` to create a temp spool file before asserting that inline-send paths clean it up.
- **`src/types/index.ts`** — imports the `EmailJobPayload` type used to shape the `REQUEST` fixture.

## Notes

- **Logger mock must stay getter-based.** Swc hoists `import` statements above the `const` declarations in this file; a plain `logger: loggerMock` property would be read at factory time (before the `const` is initialised) and throw `ReferenceError`. The queue mock is safe because each value is read from inside a function body, not at object-creation time.
- **Templates render for real.** Only the SMTP transport is mocked. If a template variable is added or renamed, these tests will fail with an EJS `ReferenceError` rather than passing silently — treat a new `ReferenceError` in this file as a template/data contract break.
- **Publish-reject path is distinct from publish-fail.** `publishToQueue` returning `false` (path 3) triggers an inline fallback; a *rejected* promise (adapter contract violation) is caught, logged at `error` level with `template` and `to`, and the function still resolves `void` with **no** inline send. These are separate `describe` blocks.
- **Mutual-exclusivity table** (`it.each`) encodes the invariant that exactly one of enqueue / inline-send fires per call. It is the fastest way to catch an inverted branch condition.
- **File is truncated** in the provided content; the attachment-discard tests after the first `it` are incomplete. The full file likely contains additional assertions about spool cleanup on the publish-fail inline path.
