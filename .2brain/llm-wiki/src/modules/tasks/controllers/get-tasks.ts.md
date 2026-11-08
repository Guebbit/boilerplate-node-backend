---
source: src/modules/tasks/controllers/get-tasks.ts
sha256: 3438535b11a1b330dc827473f62243707be2224f1af8cbeade0ae015ddddde89
generated_at: 2026-11-08T08:32:04.072794+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/controllers/get-tasks.ts

## Purpose

Controller for `GET /tasks` and `POST /tasks/search`, exposing the staff task queue in both query-string and DTO-body spellings. It is built on the shared `createSearchController` factory so the two routes share one validation/search pipeline. The response is scoped to the caller's jurisdiction and is deliberately never Redis-cached.

## Key elements

- **`searchTasksQuerySchema`** — Zod schema extending the orval-generated `SearchTasksBody` with `page` (from `pageSchema`), `pageSize` (from `pageSizeSchema`), and `overdue` (`optionalBooleanSchema`). Coercion happens here because the GET form arrives as query text, not typed JSON.
- **`getTasks`** (named export) — The actual search controller created via `createSearchController`. Bound to entity `'tasks'`, validated against `searchTasksQuerySchema`, and delegates to `taskService.search(parsed, callerContextOf(request))`, returning `Promise<TasksResponse>`.

## Relationships

- **`src/modules/tasks/service.ts`** — Calls `taskService.search` to perform the actual lookup; this controller is a thin HTTP-to-service bridge.
- **`src/infrastructure/surfaces/create-search-controller.ts`** — Provides the `createSearchController` factory that wires up routing, schema validation, and error handling for both GET and POST variants.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf(request)` to extract the authenticated caller's jurisdiction context passed into the service call.
- **`src/infrastructure/http/schemas.ts`** — Provides the reusable `pageSchema`, `pageSizeSchema`, and `optionalBooleanSchema` used to build `searchTasksQuerySchema`.
- **`src/modules/tasks/routes.ts`** — Registers `getTasks` on the router for the `/tasks` and `/tasks/search` endpoints.
- **`src/types/index.ts`** — Source of the `TasksResponse` return type.

## Notes

- The docstring explicitly states this endpoint is **never Redis-cached** because the result is per-person (jurisdiction-scoped), not a shared shop-wide value. Do not add caching at this layer.
- `overdue` is coerced from a string boolean (e.g. `"true"`/`"false"`) to a real boolean via `optionalBooleanSchema`; downstream code can rely on a typed `boolean | undefined`.
- The module uses only a named export (`getTasks`); there is no default export.
