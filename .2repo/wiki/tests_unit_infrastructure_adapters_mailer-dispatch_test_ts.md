# tests/unit/infrastructure/adapters/mailer-dispatch.test.ts

## Purpose

Unit tests for the `enqueueEmail` dispatch function in `mailer.ts`, covering its three delivery branches (no broker → inline send; broker OK → queue publish; broker publish fails → inline fallback) plus the edge case where the queue adapter rejects instead of returning `false`. The file exists to pin down a "three-branch claim" that no other test in the codebase asserted, and to document why each branch's logging, return shape, and payload shape matter for production delivery of password-reset and auth emails.

## Key elements

- **`enqueueEmail` (imported)** — the function under test; dispatches an email either inline via SMTP or by publishing a job to the queue.
- **Mocks (hoisted via `jest.mock`)** — `nodemailer` (sendMail), `@infrastructure/adapters/queue` (isQueueEnabled, publishToQueue), `@infrastructure/adapters/logger` (info/debug/warn/error).
- **`REQUEST` / `TEMPLATE` / `DATA`** — shared fixtures: a minimal `EmailRequest`, the EJS template name, and the full variable set the template interpolates.
- **`describe` blocks (one per path)** — path 1 (no broker), path 2 (publish succeeds), path 3 (publish returns `false`), path 3-reject (publish throws), and a mutual-exclusivity `it.each` table.
- **Logger mock with getters** — uses `get logger()` / `get auditLogger()` instead of direct property references to avoid a TDZ error under swc's ESM import hoisting.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — the sole production module under test. The file imports `enqueueEmail` and the `EmailRequest` type from it. Every assertion in this file constrains `enqueueEmail`'s observable contract (return type, logging level, payload shape, call counts).
- **`@infrastructure/adapters/queue`** (mocked) — `isQueueEnabled` and `publishToQueue` are stubbed to drive the three branches. The test that pins `publishToQueue` to *resolve* a boolean (rather than reject) is the consumer-side half of a contract also pinned in `queue.test.ts`.
- **`nodemailer`** (mocked) — only `createTransport().sendMail` is stubbed; the EJS rendering that happens before the SMTP call is real.
- **`@infrastructure/adapters/logger`** (mocked) — asserts that enqueue is logged at `debug`, not `info`, and that a failed publish does not log a successful enqueue.

## Notes

- **Logger mock must use getters.** `jest.mock` factories are hoisted above all `const` declarations. Under swc (which hoists ESM imports to the top of the emitted file), reading a `const` inside a factory literal throws a TDZ error. Getters defer access until the property is read, by which time the `const` is initialized. The queue and nodemailer mocks avoid the issue because they reference their variables from inside arrow functions, not at the object's top level.
- **`enqueueEmail` resolves `undefined` on every path.** Tests assert `.resolves.toBeUndefined()` explicitly so that a future refactor cannot leak a `SentMessageInfo` object on the inline path and silently change the return contract.
- **Inline paths render EJS for real.** Only the SMTP transport is mocked. A missing variable in `DATA` surfaces as an EJS `ReferenceError` rather than a blank line — useful for catching template/data mismatches.
- **The rejection test is intentionally separate.** It documents *why* `queue.test.ts` must pin `publishToQueue` to resolve `false` rather than throw: `enqueueEmail` has no `catch`, and a rejection would skip the inline fallback entirely, surfacing later as an unhandled rejection with no request context.
