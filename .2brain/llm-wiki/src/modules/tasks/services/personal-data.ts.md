---
source: src/modules/tasks/services/personal-data.ts
sha256: 93c4227546c01e22347a17d70f0cad370ee1c17e87afbed6107bcb7e306a94fe
generated_at: 2026-11-14T22:11:32.833865+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/services/personal-data.ts

## Purpose

Implements the two GDPR personal-data operations for tasks — **export** and **erasure** — against the same set of "own tasks" identified by `ownTasksFilter`. The functions are co-located so the export and the deletion can never drift apart.

## Key elements

- **`findOwnTasks(subject)`** — Fetches the data subject's visitor tasks (signed-in + verified-address) via `taskRepository.findAll` with `ownTasksFilter`, paginated through `readAll`.
- **`findOwnTasksForExport(subject)`** — Maps the above to `ExportTask[]` via the private `toExportTask` mapper.
- **`findSystemTasksForExport(subject)`** — Fetches system tasks where `source: TaskSource.system` and `subjectId` matches the account, mapped to `ExportSystemTask[]`.
- **`eraseOwnTasks(subject, session)`** — The `personalData.erase` hook. Runs four sequential repository calls inside the hard-delete transaction (`deleteOwned`, `deleteSystemAbout`, `detachSubject`, `forgetStaff`), then returns an `AfterErase` callback that mails the support inbox the `[#ref]` list of deleted messages.
- **`mailErasureNotice`** *(private)* — Enqueues an erasure-notice email to `supportEmail()` using `erasureNoticeEmail` + `getDefaultLocale`.
- **`toExportTask` / `toExportSystemTask`** *(private)* — Build plain-object DTOs, stripping `assigneeId` and note-author fields; dates serialised via `.toISOString()`.
- **`exportNotesOf`** *(private)* — Reduces notes to `{ body, at }` only (author is excluded).

## Relationships

- **`src/modules/tasks/repository.ts`** — The `taskRepository` instance is the primary data-access channel. Export paths call `findAll` (with `ownTasksFilter` or a `subjectId` filter); the erasure path calls `deleteOwned`, `deleteSystemAbout`, `detachSubject`, and `forgetStaff` in sequence.
- **`src/modules/tasks/domain/index.ts`** — Imports `ownTasksFilter`, the shared predicate that defines "this person's own tasks." Both export and erasure rely on it so they cover the identical set.
- **`src/modules/tasks/emails.ts`** — Imports `erasureNoticeEmail` to build the post-erasure support notice.
- **`src/modules/tasks/model.ts`** — Imports the `TaskDocument` type for mapper signatures.
- **`src/infrastructure/persistence/search.ts`** — Uses `readAll` + `MAX_CONFIGURED_PAGE_SIZE` for paginated reads.
- **`src/infrastructure/persistence/create-repository.ts`** — Uses `toObjectId` for the system-task lookup and the `Lean` type alias.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` delivers the erasure notice.
- **`src/infrastructure/adapters/config.ts`** — `supportEmail()` supplies the recipient address.
- **`src/infrastructure/i18n/index.ts`** — `getDefaultLocale` localises the notice email.
- **`src/kernel/registry.ts`** — Provides the `PersonalDataSubject` and `AfterErase` contracts this service fulfils.
- **`src/types/index.ts`** — `TaskSource`, `ExportTask`, `ExportSystemTask` shape the output DTOs.

## Notes

- **`findAll`, not `search`.** `findOwnTasks` deliberately uses a raw `findAll` filter. The `search` module's `email` spec is a **regex** designed for staff free-text search; using it here would let one subject read another's task whose address merely *contains* theirs.
- **Real objects, not `Omit`.** `toExportTask` constructs a fresh plain object. Returning the Mongoose document (or a type-level `Omit`) would still let the document's own `toJSON()` serialise every staff field.
- **Sequential erasure steps.** `ClientSession` permits only one in-flight operation, so the four repository calls must stay `await`-chained — do not parallelise.
- **Hard-delete only.** `eraseOwnTasks` is invoked inside the hard-delete transaction. It must never run at the reversible lock stage, or a later restore would find missing messages.
- **After-erase callback is fire-and-forget for the caller.** `mailErasureNotice` rejects on queue failure; the caller logs and the erasure still stands (the data is already gone).
- **System tasks ≠ visitor tasks.** System tasks are matched by `subjectId` (account) only, never by email address, because a system task is *about* an account. The legal basis for including them in the export is cited inline (CJEU C-434/16, EDPB 01/2022).
