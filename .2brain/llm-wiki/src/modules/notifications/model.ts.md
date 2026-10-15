---
source: src/modules/notifications/model.ts
sha256: d89e920c196b8b1e9d2f95536522c4855c48b033ceba236bfa077285cecb0fd2
generated_at: 2026-10-15T10:50:31.885305+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/model.ts

## Purpose

Defines the Mongoose schema and model for persisted notifications, plus the TypeScript type system that ties each `code` to its `params` shape. The design stores a semantic `code` + structured `params` pair (never rendered text) so that localization lives entirely in the frontend and a row remains valid across language changes.

## Key elements

- **`NOTIFICATION_CODES` / `NOTIFICATION_SEVERITIES`** — `as const` arrays enumerating the closed set of valid values; also used as Mongoose `enum` constraints.
- **`NotificationCode` / `NotificationSeverity`** — literal-union types derived from the arrays above.
- **`NotificationParametersByCode`** — interface mapping each code to its params interface (e.g. `CartLineRemovedParams`, `PreorderDelayedParams`).
- **`NotificationBody`** — discriminated union `{ code: C; params: … }` per code; narrowing on `code` narrows `params`.
- **`NotificationDocument`** — full document type: common fields (`userId`, `severity`, `readAt`, `createdAt`) ∩ `NotificationBody`.
- **`notificationSchema`** — Mongoose schema; `params` is `Schema.Types.Mixed`; `updatedAt` is disabled; a single compound index `{ userId: 1, createdAt: -1 }` is declared.
- **`applyNotificationTransform`** — wraps `applySerialization` to normalize lean reads (`_id`→`id`, strips `__v`).
- **`notificationModel`** — the compiled Mongoose model (`'Notification'`).

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, imported here to build `applyNotificationTransform`.
- **`src/modules/notifications/repository.ts`** — consumes `notificationModel` and `applyNotificationTransform` for all persistence queries (the schema comment notes "Queries live in `./repository`").
- **`src/modules/notifications/factories.ts`** — the writer side; constructs `NewNotification` values whose shape matches the same `NotificationBody` union.
- **`src/modules/notifications/presenter.ts`** — reads `NotificationDocument` / `NotificationBody` to render output.
- **`src/modules/notifications/index.ts`** — barrel re-export of the types and model defined here.
- **`src/types/index.ts`** — source of the params interfaces (`CartLineRemovedParams`, `CartMergeRefusedParams`, `PreorderDelayedParams`) used in `NotificationParametersByCode`.
- **`src/modules/notifications/tests/factories.ts`** — test factories that build in-memory notification documents conforming to this schema.
- **`src/modules/notifications/tests/unit/presenter.test.ts`** — exercises the presenter against documents shaped by this model's types.

## Notes

- `params` is `Mixed` at the DB level; the discriminated-union guarantee is a TypeScript contract upheld by the writers, not enforced by Mongoose or Mongo.
- `updatedAt` is deliberately off. A notification is write-once; the only post-creation mutation is `readAt`, which is self-describing.
- The single compound index `{ userId: 1, createdAt: -1 }` is shared by two operations: the inbox read (newest-first) and the cap-trim (walk from the far end). Adding a new query pattern should check whether it is covered by this index before adding another.
- `NotificationCommon` is intentionally non-exported; external code should use the exported `NotificationDocument` alias.
