---
source: src/modules/shop-tasks/tests/integration/tasks.test.ts
sha256: ddc2d0e86913cf0ce048a1e70c2fe45a9f2d5f715eb2b1783d3381e3e57a901d
generated_at: 2026-11-08T08:19:17.212181+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/integration/tasks.test.ts

## Purpose

Integration test suite that verifies the shop-task lifecycle end-to-end: which domain events open a task, which events close one, the delay rule's jurisdiction logic, and the notifications staff receive. It runs against a real test database with the full module registry wired up, treating the task engine as a black box and asserting only on persisted task rows and outbound mail.

## Key elements

- **`OPENERS` array** – Table of seven event→task mappings (event name, emit closure, expected `TaskKind`, route set, and work-screen route). Drives a parameterized `it.each` that asserts each opener creates exactly one `new`/`system` task with a defined `openKey` and `dueAt`.
- **`it.each` "opens nothing for …" block** – Six negative cases (retryable refusal, disputed final refusal, out-of-scope delay, missing `promisedAt`, disputed reversal, pre-decided dispute) that must produce zero tasks.
- **"the delay rule follows the shop's country" block** – Three tests confirming the consent-due task fires based on the *shop's* legal country (`NODE_LEGAL_COUNTRY`), not the buyer's, including a no-country edge case.
- **"what closes a task" block** – Parameterized pairs of (open-event, close-event) verifying that the correct follow-up event resolves the task.
- **Due-date sub-tests** – Dispute due date mirrors the provider deadline; consent due date is agreed + 30 days; a repeat event preserves the earlier due date.
- **Mailer mock** – `enqueueEmail` from the mailer adapter is the sole assertion surface for "who gets told"; reset in every `beforeEach`.
- **Helpers** – `onlyTask()` (asserts exactly one task, returns it), `allTasks` (alias for `findAllTasks`), `nextEventId()` (monotonic outbox-style id for `eventId`).

## Relationships

- **`@kernel/events`** – Primary stimulus: `emitDomainEvent` / `resetDomainEvents` drive every test case.
- **`@kernel/outbox`** – `settleOutboxNudges` is imported (available for outbox-driven notification assertions).
- **`@kernel/registry` + `src/modules.ts`** – `registerModules(enabledModules)` wires the real task, payment, and notification modules in `beforeEach`.
- **`@kernel/permissions` / `@kernel/access/tenant`** – `callerInScope` and `DEPLOYMENT_TENANT_ID` scope assertions to the deployment tenant.
- **`@infrastructure/adapters/mailer`** – Mocked; `enqueueEmail` captures "staff bell" assertions.
- **`@modules/tasks/tests/factories`** – `findAllTasks` reads tasks back from the test DB.
- **`@modules/users/tests/factories`** – `createUser` provisions test actors.
- **`@modules/notifications` / `@modules/payments`** – Imported services; exercised indirectly through the registered module handlers.
- **`@types`** – `TaskKind`, `TaskStatus`, `TaskResolution`, `RefundFailureReason` enums used in assertions.
- **`tests/support/callers`** – `asRole` constructs permission-scoped callers for staff-action assertions.

## Notes

- The file explicitly does **not** test the engine's internal rules (dedup, replay, staff-closes-first); those live in the unit suite at `src/modules/shop-tasks/tests/tasks.test.ts`.
- `setupTestDb()` runs once; each test gets a clean slate via `resetDomainEvents()` + mock reset, but does **not** truncate the task collection explicitly—tests rely on `expect(tasks).toHaveLength(1)` to catch leaks.
- `setEnvironment` mutates `NODE_LEGAL_COUNTRY` / `NODE_SUPPORT_EMAIL` per test; the delay-rule block changes the country mid-suite, so test ordering within that block matters.
- The `eventId` parameter passed to `emitDomainEvent` is a locally generated counter (`event-1`, `event-2`, …), not a real outbox id; it stands in for what the relay would stamp.
