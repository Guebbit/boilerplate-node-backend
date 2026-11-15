---
source: src/modules/tasks/model.ts
sha256: 6d93d39827f694d69734269a53e4f6df586258ca99f4067133bd257794578ec2
generated_at: 2026-11-14T22:08:40.003939+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/model.ts

## Purpose

Defines the Mongoose schema, indexes, serialization transform, and model for the **Task** collection. A task is either a visitor's inbound message or a system-opened situation (e.g., an overdue order). The file bridges the API-generated `Task` type (string dates, string IDs) with Mongoose's native storage (Date, ObjectId) and provides the canonical serialization path back to the wire format.

## Key elements

- **`TaskNoteDocument`** — interface for a single append-only staff note (`authorId`, `body`, `at`).
- **`TaskDocument`** — Mongoose document type. Extends `Omit<Task, …>` with native `Date` fields, `Types.ObjectId` refs, and persistence-only fields (`openKey`, `work`, `eventIds`, `overdueNotifiedAt`, `dueSoonNotifiedAt`, `noDueSoon`).
- **`TaskModel`** — `Model<TaskDocument>` type alias.
- **`taskSchema`** — the full `Schema` with all fields, defaults, enums, sub-document schemas (`link`, `notes`), and **nine indexes**:
  - `{ routeSet, status, dueAt }` — jurisdiction queue query.
  - `{ status, dueAt }` — reminder-sweep scan.
  - `{ assigneeId, status }` (partial) — "mine" list.
  - `{ openKey }` unique (partial) — dedup: two racing events → one task; loser gets E11000.
  - `{ eventIds }` (partial) — redelivery check before a system open.
  - `{ subjectId }` and `{ email }` (partial) — data-subject (`$or`) query branches.
  - `{ closedAt }` TTL (`retentionDays × DAY_SECONDS`) — expires closed tasks.
  - `{ createdAt }` TTL (partial, `source: visitor`) — expires forgotten visitor messages regardless of status.
- **`applyTaskTransform`** — built via `applySerialization(taskSchema, …)`. Omits internal fields (`openKey`, `eventIds`, `overdueNotifiedAt`, `dueSoonNotifiedAt`, `noDueSoon`, `work`), renames `_id`→`id`, drops `__v`, and converts `Date`→ISO string / `ObjectId`→string in the `after` callback.
- **`taskModel`** — `model('Task', taskSchema)` entrypoint.
- **`retentionDays`** — read once at import from `tasksConfig().NODE_TASKS_RETENTION_DAYS`; default 730 (24 months).

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, which `applyTaskTransform` wraps to add task-specific omission and type-coercion logic.
- **`src/modules/tasks/config.ts`** — source of `NODE_TASKS_RETENTION_DAYS` for both TTL indexes.
- **`src/modules/tasks/domain/index.ts`** — exports `CONTACT_ROUTE_SET`, used as the schema default for `routeSet`.
- **`src/domain-primitives/time.ts`** — exports `DAY_SECONDS` used to convert retention days into `expireAfterSeconds`.
- **`src/modules/tasks/index.ts`** — module barrel that re-exports `taskModel`, `taskSchema`, `TaskDocument`, `applyTaskTransform`, etc. for consumers.
- **`src/modules/tasks/services/overdue.ts`** — reads/writes `overdueNotifiedAt` and `dueSoonNotifiedAt`; queries via the `{ status, dueAt }` index.
- **`src/modules/tasks/services/contact.ts`** — opens visitor tasks; relies on the `openKey` unique index for dedup of racing events.
- **`src/modules/tasks/services/personal-data.ts`** — issues the `$or` (subjectId / email) data-subject query served by the two partial indexes.
- **`src/modules/tasks/services/read.ts`** — calls `applyTaskTransform` on lean (bypass-`toJSON`) results to produce wire-shaped output.
- **`src/modules/tasks/events.ts`** — the `eventIds` array and its index implement the redelivery no-op check before a system open.
- **`src/modules/tasks/tests/factories.ts`** — constructs `TaskDocument` instances conforming to this schema for test setups.

## Notes

- **TTL index is immutable at runtime.** Mongo refuses to alter an existing `expireAfterSeconds` in place. Changing `NODE_TASKS_RETENTION_DAYS` and restarting will **fail the boot** because `autoIndex` detects a conflicting index definition. The fix is `npm run db:sync`, which drops and rebuilds the index. The same caveat applies to the `audit-logs` module's TTL index.
- **Two TTL indexes, different scopes.** The `closedAt` TTL applies to all tasks (open tasks have no `closedAt`, so they are never expired). The `createdAt` TTL is partial on `source: visitor` so that forgotten anonymous messages are cleaned up even if never closed, while system tasks (work owed) keep only the closed-only rule.
- **`openKey` unique index is partial.** Only documents where `openKey` exists are constrained; visitor messages and closed tasks are unaffected.
- **`link` and `notes` sub-documents disable `_id`** (`_id: false`) to keep the stored shape flat.
- **`seenCount` defaults to 1** in the schema, even though it is not listed in the `TaskDocument` Omit list — it is a persistence-side counter not exposed on the generated API type.
- **Serialization omits fields that are internal bookkeeping** (`openKey`, `eventIds`, `overdueNotifiedAt`, `dueSoonNotifiedAt`, `noDueSoon`, `work`). These are never on the wire.
- **`routeSet` is frozen at open time** (default `CONTACT_ROUTE_SET`); it is not a computed or mutable routing value.
