---
source: src/modules/tasks/controllers/get-tasks.ts
sha256: 678666e8cdf0b9c6e5498a1b95c40569c25da571b92cab6664bf3f162a7c2f2e
generated_at: 2026-11-14T22:06:17.824671+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/controllers/get-tasks.ts

## Purpose

Single-export controller that serves `GET /tasks` and `POST /tasks/search` for staff, searching and paginating tasks within the caller's jurisdiction. It is deliberately **never Redis-cached** because the result set is scoped to one person's permissions, not a shared shop-wide answer.

## Key elements

- **`searchTasksQuerySchema`** — Zod schema extending the orval-generated `SearchTasksBody` with `page`, `pageSize`, and `overdue` fields. These are coerced from query-string text (GET form) into typed values.
- **`getTasks`** *(exported)* — The controller produced by `createSearchController`. Declares `entity: 'tasks'`, binds `searchTasksQuerySchema`, and delegates to `taskService.search(parsed, callerContextOf(request))`, returning `Promise<TasksResponse>`.

## Relationships

- **`src/infrastructure/surfaces/create-search-controller.ts`** — Supplies the `createSearchController` factory that wires schema validation, route-method dispatch, and response shaping around the `runSearch` callback.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)`, which extracts the authenticated caller's identity/jurisdiction passed to the service.
- **`src/infrastructure/http/schemas.ts`** — Provides the reusable Zod primitives `pageSchema`, `pageSizeSchema`, and `optionalBooleanSchema` used to build `searchTasksQuerySchema`.
- **`src/modules/tasks/services/index.ts`** — Source of `taskService`; the `search` method performs the actual data lookup.
- **`src/modules/tasks/routes.ts`** — Mounts `getTasks` at the `GET /tasks` and `POST /tasks/search` paths.
- **`src/types/index.ts`** — Declares the `TasksResponse` type that `runSearch` resolves to.

## Notes

- The `overdue` field is an **optional boolean** parsed from a query string (e.g. `?overdue=true`), not a JSON body field. If adding new query params, follow the same pattern of extending `SearchTasksBody` with string-coerced schemas rather than redefining the body shape.
- Because `createSearchController` handles both GET and POST, the same schema validates both the query string and the JSON body—keep field types compatible with both encodings.
- See `docs/modules/tasks.md` for broader module context (per the file's doc comment).
