---
source: src/modules/tasks/tests/integration/export.test.ts
sha256: 16442f3a570f06081cd96362817a17a5a0973d1c93448e9cfbac3f54bc00c80d
generated_at: 2026-11-14T22:14:46.258444+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/export.test.ts

## Purpose

Integration tests for the **tasks** section of a personal-data export (GDPR Art. 12(6)). Verifies the ownership rule — a person sees tasks filed under their account ID *or* under an address they have proven — and the redaction rules (no staff IDs, no dedup keys). Also covers the separate **systemTasks** subsection for account-related system tasks.

## Key elements

- **`collect`** (destructured from `tasksModule.personalData[0]`) — the function under test for the tasks section; called with a subject object `{ userId, email, emailVerified }`.
- **`collectSystem`** (destructured from `tasksModule.personalData[1]`) — the parallel function for the systemTasks subsection.
- **`fileTask(email, subjectId?, message?)`** — helper that creates a task via `taskService.create`; `subjectId` simulates a signed-in account.
- **`subject(emailVerified)`** — builds the subject object passed to `collect`, toggling the address-proof flag.
- **`aboutAccount()`** — helper that inserts a `TaskSource.system` / `TaskKind.export_failed` task directly via `taskRepository.create` for the systemTasks tests.
- **`describe('the tasks section…')`** — 7 cases covering: verified-address inclusion, pre-signup tasks, signed-in-by-id inclusion regardless of proof, exclusion while unproven, exclusion of other accounts/addresses, empty-array guarantee, and field fidelity (category, orderNumber, status, notes without `authorId`).
- **`describe('the systemTasks section…')`** — 2 cases covering: notes/fields present while `assigneeId`/`openKey`/`authorId` are stripped, and exclusion of another account's tasks.

## Relationships

- **`src/modules/tasks/module.ts`** — imported as `tasksModule`; this file destructures its `personalData` array to obtain the two collect functions (`collect`, `collectSystem`) that are the units under test.
- **`src/modules/tasks/services/index.ts`** — provides `taskService` (create, resolve, addNote) used to set up test fixtures and exercise the resolve/annotate path.
- **`src/modules/tasks/repository.ts`** — provides `taskRepository` for direct DB inserts of system tasks (bypassing the service layer).
- **`src/types/index.ts`** — supplies `TaskKind`, `TaskLinkType`, `TaskSource` enums referenced in the systemTasks fixture.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises a clean in-memory DB before all tests run.
- **`tests/support/callers.ts`** — `callerContextAs('admin')` builds a staff caller context passed to `resolve`/`addNote`.

## Notes

- The `personalData` array is positional: index 0 = tasks section, index 1 = systemTasks section. The test relies on that ordering rather than a named export.
- `exportedMessages` sorts the results before asserting, so test data order is irrelevant.
- The empty-result contract (`[]`, never `null`/`undefined`) is asserted explicitly for both sections — a regression here would break downstream manifest assembly.
- The `emailVerified` flag is the *only* switch that gates address-based ownership; account-ID ownership is always active, even when unproven.
- System-task redaction is verified at three levels: top-level property absence (`assigneeId`, `openKey`) and a `JSON.stringify` scan for the substring `authorId` (catching nested note objects).
