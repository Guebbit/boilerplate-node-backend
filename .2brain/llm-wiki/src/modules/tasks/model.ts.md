---
source: src/modules/tasks/model.ts
sha256: 662e474f0bb92f08aa62d0362359e1662fd65452fe4d8627da8676ea78463933
generated_at: 2026-11-08T08:34:50.278911+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/model.ts

## Purpose

Defines the Mongoose schema, document type, and model for the **Task** collection — a visitor's contact message or a system-opened situation. It bridges the API-generated `Task` type (strings for dates/IDs) and Mongoose's native storage (`Date`, `ObjectId`), and provides the serialization transform that converts documents back to wire format.

## Key elements

- **`TaskNoteDocument`** — shape of one append-only staff note (`authorId`, `body`, `at`).
- **`TaskDocument`** — the Mongoose document interface; omits API-level fields (`id`, `overdue`, `actions`, `earlierTasks`, computed `assigneeName`, etc.) and re-types dates as `Date` and references as `ObjectId`. Adds internal-only fields: `openKey`, `work`, `eventIds`, `overdueNotifiedAt`, `dueSoonNotifiedAt`, `noDueSoon`.
- **`TaskModel`** — `Model<TaskDocument>` type alias.
- **`taskSchema`** — the full Mongoose `Schema` with all fields, enum constraints, defaults, `timestamps: true`, and six indexes (queue, mine, openKey-unique, eventIds, subjectId, email, TTL on `closedAt`, TTL on `createdAt` for visitor tasks).
- **`applyTaskTransform`** — built via `applySerialization`; maps `_id`→`id`, drops `__v`, converts `Date`→ISO string and `ObjectId`→string, omits internal fields (`openKey`, `eventIds`, notification stamps, `noDueSoon`, `work`). Exported so lean query results can be mapped identically.
- **`taskModel`** — the exported Mongoose model instance (`model<TaskDocument, TaskModel>('Task', taskSchema)`).

## Relationships

- **`src/domain-primitives/time.ts`** — imports `DAY_SECONDS` to compute `expireAfterSeconds` for both TTL indexes.
- **`src/infrastructure/persistence/serialize.ts`** — imports `applySerialization` to construct `applyTaskTransform`.
- **`src/modules/tasks/config.ts`** — imports `tasksConfig` to read `NODE_TASKS_RETENTION_DAYS` at module-load time.
- **`src/modules/tasks/domain/index.ts`** — imports `CONTACT_ROUTE_SET` as the schema default for `routeSet`.
- **`src/modules/tasks/service.ts`** — consumes `applyTaskTransform` when mapping lean query results (e.g. `search()`), as noted in the transform's doc comment.
- **`src/modules/tasks/tests/integration/model.test.ts`** — integration tests targeting this schema and its indexes.

## Notes

- **TTL index is immutable in-place.** Changing `NODE_TASKS_RETENTION_DAYS` and restarting the process **fails boot**: Mongo refuses to alter an existing TTL index's `expireAfterSeconds`. You must run `npm run db:sync` to drop and rebuild the index. The same caveat applies to the visitor `createdAt` TTL index.
- **`overdueNotifiedAt` / `dueSoonNotifiedAt` are the sole reminder memory.** There is no separate notification log; the stamp *is* the record that a reminder was sent. They are internal-only (omitted from wire serialization).
- **`openKey` dedup via E11000.** Two racing system events targeting the same dedup key compete on the partial-unique index; the loser catches the duplicate-key error and falls through to "touch" instead of "open." Visitor tasks and closed tasks carry no `openKey` and are unconstrained.
- **Retention clock differs by source.** Closed *system* tasks expire `retentionDays` after `closedAt`; visitor messages expire `retentionDays` after `createdAt` regardless of status. A reopen unsets `closedAt`, stopping the system-task clock.
- **`email` index is for the data-subject `$or` query only.** The staff search on `email` is a case-insensitive unanchored regex that cannot use a B-tree index; these indexes exist so that an `$or` between `subjectId` and `email` can be served by a single index plan.
- **Dates leave the database as ISO strings** via `applyTaskTransform`; any code that reads a `TaskDocument` directly (not through serialization) sees native `Date` objects.
