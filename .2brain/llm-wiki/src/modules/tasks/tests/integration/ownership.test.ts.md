---
source: src/modules/tasks/tests/integration/ownership.test.ts
sha256: 589c4d87b21212d4bf47f3ec74205f033ca9fdd0ddb8d136e0b0110dca40947b
generated_at: 2026-11-14T22:16:08.605095+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/ownership.test.ts

## Purpose

Integration tests verifying two coupled guarantees: (1) a signed-in visitor's contact form submission is attributed to their account (`subjectId`), and (2) the personal-data erasure hook removes *exactly* the set of records the export (`collect`) hook lists. Covers edge cases around email verification, anonymous vs. authenticated senders, staff erasure, transactional rollback, and the collect/erase parity invariant.

## Key elements

- **`collect`** — destructured from `tasksModule.personalData[0]`; the export hook used to enumerate a person's records.
- **`erase`** — thin wrapper around `tasksModule.personalData[0].erase`; throws at runtime if the module omits the hook.
- **`ACCOUNT_ID` / `OTHER_ACCOUNT_ID`** — fixed ObjectId strings for the victim and a bystander account.
- **`subject(emailVerified)`** — builds a `PersonalDataEraser` subject object for the victim account.
- **`fileTask(email, message, subjectId?)`** — creates a task via `taskService.create`.
- **`storedMessages()`** — reads all task rows and returns their `message` values sorted.
- **`systemTask(link, extra?)`** — inserts a system-level task directly via `taskRepository.create`.
- **`FORM`** — a valid contact-form body (name, email, subject, message).
- **`describe('POST /tasks records who sent it')`** — 3 HTTP-level tests (authenticated, anonymous, bad token).
- **`describe('erasing the system tasks about a person')`** — 2 tests: deleting a task whose record *is* the account; nulling staff `assigneeId`/`notes[].authorId`.
- **`describe('erasing a person's tasks')`** — 6 tests: verified vs. unverified email, cross-address, open/spam tasks, transactional rollback, and the collect/erase set-parity check.

## Relationships

- **`src/modules/tasks/module.ts`** — source of the `personalData` manifest (`collect` + `erase` hooks under test).
- **`src/modules/tasks/services/index.ts`** — `taskService` imported and used to create tasks through the service layer.
- **`src/modules/tasks/repository.ts`** — `taskRepository` imported for direct data access (creating, reading, and inspecting task rows).
- **`src/modules/tasks/tests/factories.ts`** — `findAllTasks` helper for post-HTTP assertions.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps every erasure call to verify atomicity/rollback.
- **`src/kernel/registry.ts`** — `PersonalDataEraser` type constrains the `subject`/`session` parameters.
- **`src/types/index.ts`** — `TaskKind`, `TaskLinkType`, `TaskSource` enums used in `systemTask`.
- **`tests/support/http.ts`** — `api` (supertest-style) and `authenticateAs` for the HTTP-level describe block.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` called once at module top to prepare the test database.

## Notes

- **Email-verification semantics:** an *unverified* subject (`emailVerified: false`) is erased only by `userId` match; their email address is deliberately *not* used as an erasure key. A *verified* subject is erased by both. This distinction is exercised by the "keeps another address, another account, and the address match of an unproven account" test.
- **Collect/erase parity:** the final test in the erasure block calls `collect` first, then `erase`, and asserts the diff of stored messages equals the exported set — the invariant documented in the file's JSDoc.
- **Rollback test** injects a post-erase failure inside `withTransaction` and asserts the message survives, confirming erasure is not committed independently.
- `setupTestDb()` runs at module scope (once), not in a `beforeEach` block; the test file relies on per-test data isolation via unique account IDs.
- `storedMessages` uses `.toSorted()` (ES 2023), so the runtime must support that method.
