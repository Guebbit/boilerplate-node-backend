---
source: src/modules/tasks/tests/integration/erasure-notice.test.ts
sha256: f2f5dbaac8267219903ac634e27eaedb2c0de72e6d524f69dc5cb79d37212077
generated_at: 2026-11-14T22:14:24.242176+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/erasure-notice.test.ts

## Purpose

Integration test that verifies, across all four user-erasure paths, that a single support-mailbox notice is enqueued containing only the deleted messages' `[#ref]` identifiers—and that no sensitive fields (sender email, subject, body, username) leak into the envelope or payload. It confirms the notice survives the erasure transaction and any deferred event flush.

## Key elements

- **`doors`** — Array of four `[label, fn]` tuples, each a distinct way to erase an account: admin hard-delete, scheduled purge, inactivity reaper, and erasure-ledger replay.
- **`messageFrom(userId, email, subject)`** — Helper that creates a task/message bound to the user via `taskService.create`.
- **`notices()`** — Filters `mockEnqueueEmail` calls to only those using the `'tasks.erasure-notice'` template.
- **`describe.each(doors)`** — Parametrized block running both assertions against every erasure door.
- **Test 1** ("mails the support mailbox…"): asserts tasks are gone, exactly one notice is sent, the subject contains both `taskRef`-formatted IDs, and no secret string appears anywhere in the serialized envelope+data.
- **Test 2** ("sends nothing…"): asserts zero notices when the erased account owned no messages.
- **Mailer mock** — `enqueueEmail` is replaced at module level; the real adapter is never invoked.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is the mocked dependency; all assertions read from its call log.
- **`src/modules/tasks/emails.ts`** — Provides `taskRef`, the function used to build the expected `[#…]` identifier in assertions.
- **`src/modules/tasks/services/index.ts`** — Source of the `taskService` import used to seed test messages before erasure.
- **`src/modules/tasks/tests/factories.ts`** — `findAllTasks` confirms the messages were actually removed.
- **`src/modules/users/tests/factories.ts`** — Supplies `createUser`, `eraseAsScheduled`, `eraseAsInactive`.
- **`src/modules/users/index.ts`** — Exports `userService` (admin hard-delete door) and the `UserDocument` type.
- **`src/modules/users/friends/account.ts`** — Source of the `accountUserService` import used as the ledger-replay erasure door.
- **`src/kernel/permissions.ts`** — `callerContextAs('admin')` and `systemCallerContext('User')` provide the auth context for each door.
- **`src/kernel/events.ts`** — `resetDomainEvents` isolates the in-memory event bus between tests.
- **`src/kernel/registry.ts`** + **`src/modules.ts`** — `registerModules(enabledModules)` wires the full module graph so cross-module events fire.
- **`tests/support/environment.ts`** — `setEnvironment` sets `NODE_SUPPORT_EMAIL`, the recipient the test asserts on.
- **`tests/support/callers.ts`** — `callerContextAs` builds the admin caller identity.

## Notes

- The test intentionally does **not** mock the users or tasks modules—only the mailer adapter—so the full event/transaction lifecycle is exercised.
- The single-notice invariant (exactly one email for N messages) is the core contract under test; a second call would indicate a duplicate side-effect.
- `NODE_SUPPORT_EMAIL` must be set before any erasure runs; the recipient assertion (`desk@example.com`) would silently pass against `undefined` if the env step were removed.
- `resetDomainEvents` in both `beforeEach` and `afterEach` is deliberate: it guards against event bleed from a failing test into the next one.
