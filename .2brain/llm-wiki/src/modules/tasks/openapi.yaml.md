---
source: src/modules/tasks/openapi.yaml
sha256: d2dde69f0219a0004caa9fccbe8af8fbedf28a84ed3e9a0a25f83e14c8bc73d6
generated_at: 2026-11-08T08:35:29.584432+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **tasks** module. It declares every public endpoint the module exposes (contact intake, staff listing/search, summary counts, single-task retrieval and its sub-operations), the error codes the module can return, and the sections this module contributes to the account data-export response. It is the single source of truth that the bundler, the client, and documentation all derive from.

## Key elements

- **Tags / `x-family`** — one tag, `Tasks` (family *Core*), under which all operations are grouped.
- **`x-error-codes`** — module-level catalogue of domain errors (`TASK_ALREADY_RESOLVED`, `TASK_SUPERSEDED`, `TASK_ASSIGNEE_INVALID`, etc.) with their HTTP status and a human-readable description.
- **`x-personal-data`** — declares two required sections (`tasks`, `systemTasks`) the bundler injects into `POST /account/export`; removing the module removes these sections.
- **`POST /tasks`** (`createContactTask`) — anonymous-or-authenticated contact intake; 202 with **no body** (spam indistinguishable); idempotency-key, antibot-challenge, and bearer-session parameters; rate-limited via `contactLimiters` in `routes.ts`.
- **`GET /tasks`** (`listTasks`) — paginated, filterable task list for staff (query-param filters: sort, text, email, status, category, source, kind, assignee, overdue). Marked `x-cache: private-no-cache`.
- **`POST /tasks/search`** (`searchTasks`) — functionally identical to `GET /tasks` but with a JSON body (`SearchTasksRequest`); annotated `x-alias-of: listTasks`. Exists because a body on a GET has no defined semantics and would break `setCache` keying.
- **`GET /tasks/summary`** (`getTaskSummary`) — per-caller counts (open, mine, overdue, unassigned) for the staff badge; never cached.
- **`GET /tasks/{id}`** (`getTask`) — single task with notes, assignee, and related earlier tasks; reading a visitor task is audited; unknown/out-of-jurisdiction id → 404.
- **Schema references** — local component schemas (`Task`, `TaskSort`, `TaskStatus`, `TaskCategory`, `TaskSource`, `TaskKind`, `TaskAssigneeFilter`, `TasksResponse`, `TaskSummary`, `CreateContactTaskRequest`, `SearchTasksRequest`, `ExportTask`, `ExportSystemTask`) defined in the (truncated) `components` block.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — this file `$ref`s it for shared parameters (`IdPathParam`, `PageParam`, `PageSizeParam`, `TextParam`, `AntibotChallengeTokenHeader`, `IdempotencyKeyHeader`), shared response objects (`Unauthorized`, `Forbidden`, `Conflict`, `ValidationError`, `TooManyRequests`), and the `Email` schema.
- **`src/modules/tasks/authorization.yaml`** — defines the permission/route sets that gate `GET /tasks`, `GET /tasks/{id}`, and other staff endpoints; the "route set the caller holds" language in descriptions refers to entries in that file.
- **`src/modules/tasks/module.ts`** — the TypeScript module that registers the routes, attaches `contactLimiters` rate-limiting, wires `setCache`, and serves this spec (typically via a bundler that merges it with the root and sibling specs).
- **`src/modules/tasks/module.yaml`** — module manifest; the bundler reads it to decide which `openapi.yaml` to include, how to merge `x-personal-data` into the account-export schema, and which `authorization.yaml` routes to enforce.

## Notes

- **202 on `POST /tasks` intentionally has no response body.** This is a deliberate design choice so a spam-rejection is indistinguishable from a stored message; do not add a body without reviewing that invariant.
- **`POST /tasks/search` is an alias, not a separate capability.** Its `x-alias-of` tag signals that tests and docs should treat it as `listTasks`. If you change one, change both.
- **GET filters must stay query-param.** The comment in the spec explicitly forbids moving filters to a request body on the GET route because `setCache` keys on declared query parameters and the Fetch spec rejects GET bodies.
- **Bearer token on `POST /tasks` is optional.** A valid session token links the task to an account (for export/erasure); absence means anonymous; an *invalid* (no live session) token is a 401, not a 202.
- **`x-error-codes` at module level** are the canonical set for the module's operations; per-operation `x-error-codes` (e.g., `IDEMPOTENCY_IN_FLIGHT`) layer on top. Both are additive, not exclusive.
