---
source: src/modules/tasks/tests/integration/export.test.ts
sha256: 6f71fcc223cb0ecbef36dff309516675df26019f317c8e379484fa9cee7d813a
generated_at: 2026-11-08T08:39:10.951058+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/export.test.ts

## Purpose

Integration tests for the two task-related sections of a personal data export (the "tasks" section and the "systemTasks" section). They verify the GDPR Art. 12(6) identity rule: a task filed under an address is only exported once the account has proved that address, whereas a task filed while signed in (matched by account ID) is always exported. They also confirm that staff-identifying fields are stripped from the output and that no other account's data leaks in.

## Key elements

- **`collect`** — destructured as `tasksModule.personalData[0].collect`; the function that gathers the *tasks* section for a subject.
- **`collectSystem`** — destructured as `tasksModule.personalData[1].collect`; gathers the *systemTasks* section (system-generated tasks like failed exports).
- **`subject(emailVerified)`** — builds the subject object (`userId`, `email`, `emailVerified`) passed to both collectors.
- **`fileTask()`** — convenience wrapper around `taskService.create` that files a task under a given address and optional account ID.
- **`aboutAccount()`** — creates a `TaskSource.system` / `TaskKind.export_failed` record directly via `taskRepository.create`, bypassing the service.
- **`describe('the tasks section of an export')`** — 7 tests covering: proven-address inclusion, pre-account tasks, signed-in-but-unproven, unproven exclusion, cross-account exclusion, empty-array guarantee, and field-level fidelity (category, orderNumber, status, notes with `authorId` stripped).
- **`describe('the systemTasks section of an export')`** — 2 tests covering: staff-ID / `openKey` / `authorId` stripping, and empty-array / cross-account exclusion.

## Relationships

- **`src/modules/tasks/module.ts`** — the test imports `tasksModule` and reads `personalData` (an array of section descriptors) to obtain the `collect` callbacks under test.
- **`src/modules/tasks/service.ts`** — `taskService.create`, `.resolve`, and `.addNote` are used to seed and mutate task state through the public service API.
- **`src/modules/tasks/repository.ts`** — `taskRepository.create` is used to insert system tasks that the service layer would not normally create (e.g. `export_failed`).
- **`src/types/index.ts`** — provides the `TaskKind`, `TaskLinkType`, and `TaskSource` enums used when constructing system tasks.
- **`tests/support/callers.ts`** — `callerContextAs('admin')` produces the authenticated staff context passed to `resolve` and `addNote`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory Mongo instance before any test runs.

## Notes

- The two collectors are reached **positionally** (`personalData[0]`, `personalData[1]`), so reordering the `personalData` array in the module silently swaps which section is tested.
- `exportedMessages` uses `.toSorted()` (immutable) to normalise ordering before comparison — the export itself makes no ordering guarantee.
- The "never includes another account" test relies on the exact 24-hex `ACCOUNT_ID` string; any change to the ID in the subject helper will make it pass trivially.
- System-task notes are asserted to contain **no** `authorId` via `JSON.stringify` containment, not a structural property check, catching both direct and nested occurrences.
