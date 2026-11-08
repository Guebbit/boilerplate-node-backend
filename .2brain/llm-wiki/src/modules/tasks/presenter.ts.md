---
source: src/modules/tasks/presenter.ts
sha256: a79e63729ff95d6fb11303e2fda98c85bcac786bba6b229de974d8a014269d18
generated_at: 2026-11-08T08:35:43.111839+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/presenter.ts

## Purpose

Transforms a stored `TaskDocument` into the wire shape declared in `openapi.yaml`. It is the single choke-point where the computed, per-reader fields (`overdue`, `actions`, `assigneeName`, `earlierTasks`) are attached, so that the contact form's 201, staff reads, and every other API door all emit a consistent `Task`.

## Key elements

- **`StoredTask`** (type) — `Task` minus the four computed fields; the shape after `toJSON()` but before a reader's view is applied.
- **`TaskView`** (interface) — the per-reader additions: `actions` (flags), optional `assigneeName`, optional `earlierTasks`.
- **`NO_ACTIONS`** (const) — a `TaskView` with every action flag set to `false`; used for the visitor's own 201 response where no mutations are permitted.
- **`storedTaskOf(document)`** (function) — calls `document.toJSON()` (which maps `_id`→`id`, serialises dates to ISO strings, drops the dedup key) and casts the result to `StoredTask`.
- **`withView(stored, view, now?)`** (function) — spreads the stored task, computes `overdue` (open + past `dueAt` at read time), and conditionally attaches `actions`, `assigneeName`, `earlierTasks`. Returns a full `Task`.
- **`presentTask(document, view)`** (function) — convenience composition: `withView(storedTaskOf(document), view)`.

## Relationships

- **`src/types/index.ts`** — source of the `Task` and `TaskRef` wire types that define the output contract.
- **`src/modules/tasks/domain/index.ts`** — provides `isOpen` (status check used by `overdue`) and the `TaskActionFlags` type.
- **`src/modules/tasks/model.ts`** — source of the `TaskDocument` type (Mongoose model) that `storedTaskOf` consumes.
- **`src/modules/tasks/service.ts` / `views.ts` / `services/workflow.ts`** — downstream consumers that call `presentTask` (or its parts) and supply the appropriate `TaskView` for each audience.

## Notes

- `overdue` is **read-time arithmetic**, not a stored flag — no background sweep is needed to keep it current.
- `assigneeName` and `earlierTasks` use conditional spread, so the JSON key is **absent** (not `null`/`undefined`) when the view does not provide them. Clients should treat a missing key as "not applicable."
- `NO_ACTIONS` is a module-level constant shared by reference; do not mutate it.
- The `now` parameter on `withView` defaults to `new Date()` so tests can inject a fixed clock.
