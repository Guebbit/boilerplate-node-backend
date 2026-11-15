---
source: src/modules/tasks/openapi.yaml
sha256: e0dc0175c4c4f20ec5453c642f9b61a9dabc5597b0e3066ce11c949ed34f53a9
generated_at: 2026-11-14T22:09:18.612487+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract for the **Tasks** module. It declares every public endpoint the module exposes (create, list, search, summary, read, and the truncated write operations), the module-specific error vocabulary, the tag taxonomy, and the personal-data sections the bundler injects into `POST /account/export`. It exists as the single source of truth for the tasks API surface consumed by clients, staff tooling, and the shared contract bundler.

## Key elements
- **`tags`** — Declares the single `Tasks` tag (family `Core`) under which all operations file themselves.
- **`x-error-codes`** — Module-level error catalogue: `TASK_ALREADY_RESOLVED`, `TASK_ALREADY_SPAM`, `TASK_ALREADY_OPEN`, `TASK_SUPERSEDED`, `TASK_NOT_OPEN`, `TASK_ALREADY_ASSIGNED`, `TASK_NOT_ASSIGNED` (all 409) and `TASK_ASSIGNEE_INVALID` (422).
- **`x-personal-data`** — Declares the `tasks` and `systemTasks` arrays the bundler adds to `AccountExportResponse` (schema refs `ExportTask`, `ExportSystemTask`).
- **`paths./tasks.post`** (`createContactTask`) — Public contact submission; optional bearer for `subjectId`; antibot + idempotency guards; 202 with no body.
- **`paths./tasks.get`** (`listTasks`) — Authenticated listing with query-param filters (status, category, source, kind, assignee, overdue, sort, text, email, pagination).
- **`paths./tasks/search.post`** (`searchTasks`) — Body-based equivalent of the GET list; tagged `x-alias-of: listTasks`.
- **`paths./tasks/summary.get`** (`getTaskSummary`) — Per-caller open/overdue/unassigned counts; never cached.
- **`paths./tasks/{id}.get`** (`getTask`) — Single task with notes, assignee, and related earlier tasks; audited for visitor tasks.
- **Truncated section** — Additional per-task write operations (resolve, assign, reopen, etc.) are present but cut off in the provided excerpt.

## Relationships
- **`shared/contracts/openapi.root.yaml`** — Every cross-module parameter (`IdPathParam`, `PageParam`, `PageSizeParam`, `TextParam`, `AntibotChallengeTokenHeader`, `IdempotencyKeyHeader`), the `Email` schema, and the shared response objects (`Unauthorized`, `Forbidden`, `Conflict`, `ValidationError`, `TooManyRequests`) are `$ref`-imported from this file. This file depends on it for those definitions.
- **`src/modules/tasks/authorization.yaml`** — The security schemes (`bearerAuth`, `apiKeyAuth`) and scopes (`read:Task`, `update:Task`) referenced throughout this spec are defined there.
- **`src/modules/tasks/module.yaml`** — Module manifest that names this OpenAPI file as the module's contract; the bundler reads it to discover the spec.
- **`src/modules/tasks/module.ts`** — Runtime module entry that registers the routes defined here and wires up the `x-personal-data` sections into the account export endpoint.

## Notes
- The `x-cache: private-no-cache` extension on list/get endpoints signals per-caller caching semantics; the summary endpoint explicitly states it is never cached.
- `POST /tasks/search` is annotated `x-alias-of: listTasks` — treat it as a body-shaped twin, not a separate resource.
- The `GET /tasks` description explicitly documents *why* filters are query-only (RFC 9110 §9.3.1, Fetch spec body-on-GET rejection, and `setCache` keying on declared params). Do not move filters to a body without updating the cache-key logic.
- `x-error-codes` at the module root is a catalogue; individual operations may additionally reference shared error codes (e.g. `ANTIBOT_VERIFICATION_FAILED`, `IDEMPOTENCY_IN_FLIGHT`) via their own `x-error-codes` block.
- The `202` response on `createContactTask` deliberately has **no body** so that a spam-rejected submission is indistinguishable from a stored one.
- Security on `POST /tasks` uses `- {}` (no auth) alongside `bearerAuth` to allow anonymous submission; a token that names no live session yields 401, prompting a client refresh.
