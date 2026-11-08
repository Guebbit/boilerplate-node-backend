---
source: src/modules/tasks/tests/integration/ownership.test.ts
sha256: e9c297153ec95ea55de9937250bf313ccb6e5df420f46ed2e85442512df5b61c
generated_at: 2026-11-08T08:39:51.015306+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/ownership.test.ts

## Purpose

Integration tests verifying the ownership invariant for tasks: a signed-in visitor's messages are tied to their account, and the personal-data erasure hook removes exactly the set that the export hook lists. The file also covers that the `POST /tasks` endpoint records the authenticated sender's `subjectId` and that erasure scrubs staff references (assignee, note authors) from system tasks.

## Key elements

- **`collect` / `erase`** — extracted from `tasksModule.personalData[0]`; these are the export and erase hooks under test. `erase` is wrapped to throw if the module declares no hook.
- **`ACCOUNT_ID` / `OTHER_ACCOUNT_ID`** — two fixed Mongo ObjectIds representing the subject account and a bystander account whose data must survive.
- **`subject(emailVerified)`** — builds the `PersonalDataEraser` subject argument with a toggle for verified/unverified email.
- **`fileTask`** — shorthand for `taskService.create` with an optional `subjectId`.
- **`systemTask`** — shorthand for `taskRepository.create` with a `TaskSource.system` / `TaskKind.account_review` link.
- **`storedMessages()`** — reads all tasks and returns their `message` fields sorted, used as the observable "what survived" check.
- **`describe('POST /tasks records who sent it')`** — asserts `subjectId` is set for authenticated sends, absent for anonymous sends, and that a bad bearer token yields 401 with no row created.
- **`describe('erasing the system tasks about a person')`** — verifies deletion of tasks whose link points at the account, and scrubbing of `assigneeId` / `notes[].authorId` when a staff member is erased.
- **`describe('erasing a person's tasks')`** — covers: deletion by `subjectId` regardless of address; deletion by verified-email match (including tasks filed before the account existed); preservation of other accounts / unverified address matches; deletion across `open` and `spam` statuses; transactional rollback; and the collect/erase symmetry (removed set ≡ exported set).

## Relationships

- **`src/modules/tasks/module.ts`** — source of `tasksModule.personalData`, from which `collect` and `erase` are destructured. The tests exercise the module's manifest, not internal functions directly.
- **`src/modules/tasks/service.ts`** — `taskService.create` is used to file tasks the same way the HTTP endpoint would.
- **`src/modules/tasks/repository.ts`** — `taskRepository` is used both to seed system tasks and to assert post-erase state (row existence, `assigneeId`, `notes`).
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps every erase call, testing that erasure participates in a multi-hook transaction and rolls back on failure.
- **`src/kernel/registry.ts`** — supplies the `PersonalDataEraser` type used to type the `erase` wrapper and the `subject` argument.
- **`src/types/index.ts`** — `TaskKind`, `TaskLinkType`, `TaskSource` enum values used when seeding system tasks.
- **`src/modules/tasks/tests/factories.ts`** — `findAllTasks` is the quick assertion helper for the HTTP-level tests.
- **`tests/support/http.ts`** — `api()` and `authenticateAs` drive the `POST /tasks` endpoint tests.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` runs once at module load to prepare a clean in-memory database.

## Notes

- The file imports from `@tests/…` and `@modules/…` aliases (not relative paths); the resolver must be configured in `tsconfig` / test config.
- `erase` is called **without** an HTTP round-trip; it invokes the module hook directly inside `withTransaction`. The collect/erase symmetry test compares the *message* arrays, not full documents.
- The "unproven account" case (`emailVerified: false`) means the email-address match is **not** sufficient to erase—only the `subjectId` link applies. This is the subtlest invariant and is tested explicitly.
- All assertions on stored state use `taskRepository` or `findAllTasks` directly (not the HTTP API), because the tests are validating persistence-level invariants after the erase hook runs.
