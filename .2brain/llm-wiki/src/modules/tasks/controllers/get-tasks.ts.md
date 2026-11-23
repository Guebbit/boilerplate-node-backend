---
source: src/modules/tasks/controllers/get-tasks.ts
source_sha256: 5bbabd31ff44d442f3ad5ff8b5f468d66c0f44c4c7647393c50712488c5c070b
context_sha256: 964b3b45d8c58bd1d0c9cc058c1f8dda558e5b1be74f6a2120ffad6f69e90d50
generated_at: 2026-11-22T07:57:58.533789+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/controllers/get-tasks.ts

## Purpose
Controller for `GET /tasks` and `POST /tasks/search`, which expose the staff task queue in both a query-string and a JSON-body form. It is built on the shared search-controller factory and is never Redis-cached, because results depend on the caller's jurisdiction rather than being a shared shop-wide answer.

## Key elements
- `searchTasksQuerySchema` (module-private): extends the orval-generated `SearchTasksBody` (from `@api/schemas.zod`) with `page` (`pageSchema`), `pageSize` (`pageSizeSchema`) and `overdue` (`optionalBooleanSchema`). These are coerced from strings because the GET form sends them as query text.
- `getTasks` (exported): controller created via `createSearchController` with `entity: 'tasks'` and the schema above. Its `runSearch` calls `taskService.search(parsed, callerContextOf(request))` and returns a `TasksResponse`.

## Relationships
- `src/infrastructure/surfaces/create-search-controller.ts`: provides `createSearchController`, which this file configures with the entity name, schema and `runSearch` callback.
- `src/infrastructure/http/schemas.ts`: supplies `pageSchema`, `pageSizeSchema` and `optionalBooleanSchema`.
- `src/infrastructure/http/request.ts`: supplies `callerContextOf`, which derives the caller context from the request for the service call.
- `src/modules/tasks/services/index.ts`: supplies `taskService`, whose `search` does the actual work.
- `src/types/index.ts`: supplies the `TasksResponse` type (imported as `@types`).
- `src/modules/tasks/routes.ts`: the route definitions that use the exported `getTasks`. This file does not show how it is wired.

## Notes
- Both HTTP spellings share one schema and one handler. The only difference is that the GET form carries values as query text, hence the string coercion on `page`, `pageSize` and `overdue`.
- The caller context is passed to the service, so results are scoped to the caller's jurisdiction. The file's module doc points to a "jurisdiction" section of the tasks module docs for details.
