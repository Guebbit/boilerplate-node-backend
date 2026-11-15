---
source: src/modules/tasks/services/read.ts
sha256: 72809779598a08b619247e74b16d8ed749e06cfc3161cab1537fb0717787a8b9
generated_at: 2026-11-14T22:12:03.901596+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/services/read.ts

## Purpose

Service layer for the two read operations in the tasks module: a paginated, multi-filter search and a single-task fetch by id. Both are bounded to the caller's jurisdiction so a caller never sees tasks outside their scope. The file translates domain filters into repository queries, enriches raw documents with assignee names and viewer-specific presentation, and returns shaped responses.

## Key elements

- **`TaskFilters`** (type) — `SearchTasksRequest` minus the pagination fields, with `page`/`pageSize` widened to `string | number` to accept uncoerced input.
- **`scopeOf(filters, context, now)`** (internal) — Builds the MongoDB `$and` clause array: jurisdiction scope, optional `overdue` (open status + past due), and `assignee` resolution (`me` → caller id, `none` → no assignee, other → ObjectId). Returns the full query object including plain equality filters (status, category, source, kind).
- **`search(filters, context)`** (exported) — Paginated task search. Delegates to the repository's search method, then bulk-resolves assignee names, computes per-row viewer flags, and maps rows through `presentTaskListItem`. Returns `{ items: TaskListItem[], meta: PaginatedMeta }`.
- **`getById(id, context)`** (exported) — Fetches a single task. Returns a 404 reject (i18n message) if the task is missing **or** outside the caller's jurisdiction. On success, resolves assignee name and any earlier linked tasks in parallel, then presents via `presentTask`.
- **`earlierThan(task, context)`** (internal) — Queries up to 20 prior tasks sharing the same `link.type`/`link.id` and `createdAt ≤` the target, within the caller's jurisdiction. Returns minimal `{ id, kind, status, createdAt }` tuples.

## Relationships

- **`src/modules/tasks/repository.ts`** — Sole data-access dependency; this file calls the repository's search, findById, and findAll methods.
- **`src/modules/tasks/access.ts`** — Uses `jurisdictionScope` (to build the scope clause) and `inJurisdiction` (to gate `getById`).
- **`src/modules/tasks/domain/index.ts`** — Imports `OPEN_STATUSES` for the `overdue` filter.
- **`src/modules/tasks/presenter.ts`** — `presentTask`, `presentTaskListItem`, `withView` shape raw documents into API responses.
- **`src/modules/tasks/views.ts`** — `assigneeNamesOf` resolves name maps; `viewerOf` computes per-row viewer flags.
- **`src/modules/tasks/model.ts`** — `TaskDocument` type for raw repository rows.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` wrap HTTP-level results.
- **`src/infrastructure/i18n/context.ts` / `index.ts`** — `t()` for the localized 404 message.
- **`src/infrastructure/persistence/search.ts`** — `PaginatedMeta` type on the search result.
- **`src/infrastructure/persistence/create-repository.ts`** — `isObjectIdString` / `toObjectId` for safe ObjectId coercion in the assignee clause.
- **`src/types/auth-context.ts` / `index.ts`** — `CallerContext`, `SearchTasksRequest`, `Task`, `TaskListItem` type definitions.
- **`src/modules/tasks/services/index.ts`** — Barrel that re-exports this module alongside other task services.

## Notes

- **404, not 403, for out-of-jurisdiction tasks.** `getById` deliberately returns a not-found response so the API does not confirm that a task exists for a caller who cannot see it.
- **`assignee=me` with no account id.** If the caller is an API-key principal (no `caller.id`) or the id is not a valid ObjectId string, the clause degrades to `{ _id: { $in: [] } }` — matches nothing rather than erroring.
- **`page`/`pageSize` arrive as strings.** The repository's `normalizePagination` (called internally by the search method) coerces and bounds them; this file simply passes them through.
- **`earlierThan` is capped at 20** and only runs when `task.link` is present (i.e., the task references an external record).
- **`now` is captured once** per `search`/`getById` call and threaded through, so the `overdue` comparison and presentation timestamp are consistent within a single request.
