# tests/unit/infrastructure/adapters/mailer-dispatch.test.ts

## Purpose

Unit tests for `enqueueEmail` in `src/infrastructure/adapters/mailer.ts`, covering all three dispatch branches (no broker, broker OK, broker publish failure) plus the contract that the queue adapter answers `false` rather than rejecting. The file exists because the three-branch dispatch logic was previously untested and a silent failure (unresolved broker, no fallback) would drop password-reset emails invisibly.

## Key elements

- **`enqueueEmail`** (imported from `@infrastructure/adapters/mailer`) — the function under test; dispatches an email either to a message queue or inline via SMTP.
- **`sendMailMock`** — mock for `nodemailer.createTransport().sendMail`; asserts whether inline SMTP delivery happened.
- **`isQueueEnabledMock` / `publishToQueueMock`** — mocks for `@infrastructure/adapters/queue`; drive the three-branch logic.
- **`loggerMock`** (exposed via getters) — mock for `@infrastructure/adapters/logger`; verifies debug-vs-info level on enqueue.
- **`DATA`** — full set of EJS template variables; used because the inline paths render the template for real.
- **Path 1 suite** — no broker: asserts inline send, no publish, `undefined` return.
- **Path 2 suite** — publish succeeds: asserts queue publish, no inline send, payload carries template name + data (not HTML), debug-level log.
- **Path 3 suite** — publish returns `false`: asserts inline fallback send, no debug log, `undefined` return.
- **Reject-guard suite** — `publishToQueue` rejects: documents that `enqueueEmail` has no catch, so a rejecting adapter would lose the fallback entirely.
- **Mutual-exclusivity table** — `it.each` over all three configs asserting exactly one delivery attempt occurs.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — the module under test; provides `enqueueEmail` and the `EmailRequest` type.
- **`@infrastructure/adapters/queue`** (mocked) — supplies `isQueueEnabled` and `publishToQueue`; its `boolean` return contract is what path 3 relies on.
- **`@infrastructure/adapters/logger`** (mocked) — `enqueueEmail` logs enqueue events at debug level.
- **`nodemailer`** (mocked) — the inline SMTP transport; the test asserts call count, not message content.

## Notes

- The logger mock uses **getter properties** (`get logger()`) rather than a direct reference. This is required because `swc` hoists `import` statements above `const` declarations, so the `jest.mock` factory would execute before `loggerMock` is initialised. The nodemailer and queue mocks are already safe because their factories access variables from inside arrow-function bodies, not at object-literal top level.
- The inline paths **render EJS templates for real** (only the SMTP transport is stubbed). A missing template variable surfaces as an EJS `ReferenceError`, not a blank line — a useful side-effect of the setup.
- `enqueueEmail` always resolves `void`. The tests pin this so a future change cannot accidentally leak a `SentMessageInfo` on one branch and cause callers to depend on it.
- The "adapter never rejects" suite is a **contract pin**, not a behavior test: it documents *why* `queue.test.ts` must assert `publishToQueue` resolves `false` rather than throwing. If that contract breaks, path 3's fallback is silently skipped and the rejection becomes an unhandled promise rejection with no request context.
