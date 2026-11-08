---
source: src/modules/tasks/tests/integration/erasure-notice.test.ts
sha256: b9d3b7dee9d4b04bf77a53b21bd986e7d04654a3be10cc4b50141e0c9f56b6e8
generated_at: 2026-11-08T08:38:56.951580+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/erasure-notice.test.ts

## Purpose

Integration test proving that, when a user account is erased, exactly one `tasks.erasure-notice` email is queued to the support mailbox containing **only** the `[#ref]` identifiers of that user's deleted contact messages. It asserts that no personal data (email address, subject, body text, username) leaks into the notice. The test drives all four erasure paths through the `users` module's real service calls so the notice is proven to survive the transaction and any deferred step.

## Key elements

- **`doors`** — array of four `[label, eraserFn]` tuples covering every erasure path: admin hard-delete (`userService.removeById`), scheduled purge (`eraseAsScheduled`), inactivity reaper (`eraseAsInactive`), and ledger replay (`userService.eraseAgain`).
- **`messageFrom(userId, email, subject)`** — helper that creates a task (contact message) via `taskService.create`.
- **`notices()`** — filters the mocked `enqueueEmail` call log for the `tasks.erasure-notice` template.
- **`describe.each(doors)`** — parameterized block so both assertions run against all four erasure paths.
- **Test 1** — asserts tasks are gone, exactly one notice is queued, the subject contains each `[#<taskRef>]`, and the serialized envelope+data contain none of the user's PII.
- **Test 2** — asserts zero notices are queued when the erased account has no messages.
- **Jest mock** — `@infrastructure/adapters/mailer` is replaced with a `jest.fn()` for `enqueueEmail`; no real mail is sent.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is the sole mock target; the test inspects its call arguments (envelope, template, data).
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the event bus between tests.
- **`src/kernel/permissions.ts`** — `systemCallerContext('User')` supplies the caller for the ledger-replay door.
- **`src/kernel/registry.ts`** — `registerModules(enabledModules)` re-registers domain modules each test.
- **`src/modules.ts`** — exports `enabledModules` used in registration.
- **`src/modules/tasks/emails.ts`** — `taskRef(_id)` computes the `[#…]` string the test expects in the subject.
- **`src/modules/tasks/service.ts`** — `taskService.create` is how the fixture messages are made.
- **`src/modules/tasks/tests/factories.ts`** — `findAllTasks` verifies the user's tasks are actually deleted.
- **`src/modules/users/index.ts`** / **`src/modules/users/services/index.ts`** — `userService.removeById` and `userService.eraseAgain` are the real erasure doors under test.
- **`src/modules/users/model.ts`** — `UserDocument` type for the parameter in `doors`.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `eraseAsScheduled`, `eraseAsInactive` build fixtures and drive two of the four doors.
- **`tests/support/callers.ts`** — `callerContextAs('admin')` for the admin door.
- **`tests/support/environment.ts`** — `setEnvironment` sets `NODE_SUPPORT_EMAIL` (the recipient asserted in the test).
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the in-memory/SQLite test database.

## Notes

- The mock resets and re-registers modules in `beforeEach`; forgetting either would cause cross-test leakage of queued emails or stale module registrations.
- The PII check serialises **both** the envelope and the data payload via `JSON.stringify` and scans for known sensitive strings — adding a new field to the email template without scrubbing will be caught here.
- `notices()` matches on the exact template string `tasks.erasure-notice`; renaming that template in `src/modules/tasks/emails.ts` will silently break this filter (the test would then assert zero notices and pass vacuously on the "no messages" case, but fail the "has messages" case).
