---
source: src/modules/notifications/model.ts
sha256: a29648f62ad4924631e109bd2520e9ea5a8b4a4a61ea47804fe67da82f679bd3
generated_at: 2026-11-08T06:31:49.449745+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/model.ts

## Purpose

Defines the Mongoose schema and typed exports for a notification row. Each row stores a `code` and its `params` (never a rendered sentence); the frontend translates the code from its own locale files, so a stored row is language-agnostic and outlives copy changes. This file is the single source of truth for the persisted shape and the index strategy.

## Key elements

- **`NotificationCode`** — union of all valid notification codes, derived from the `Notification` contract type in `@types`.
- **`NotificationParametersByCode`** — maps each code to its specific `params` shape; the one place a code and its params are tied together.
- **`NotificationBody`** — discriminated union of `{ code, params }` pairs. Narrowing on `code` narrows `params`.
- **`NotificationDocument`** — `NotificationCommon` (userId, severity, audience, readAt, createdAt, tenantId, sets, dedupeKey, expiresAt) intersected with `NotificationBody`.
- **`NotificationModel`** — `Model<NotificationDocument>`; the handle passed to the repository.
- **`notificationSchema`** — Mongoose `Schema<NotificationDocument>` with three indexes:
  - `{ userId: 1, createdAt: -1 }` — inbox read + cap trim.
  - `{ userId: 1, dedupeKey: 1 }` (unique, partial on `dedupeKey: { $type: 'string' }`) — one staff row per situation per recipient.
  - `{ expiresAt: 1 }` with `expireAfterSeconds: 0` — TTL index for staff rows.
  - `params` is `Schema.Types.Mixed`; type safety is application-level via the union, not enforced by the database.
  - `updatedAt` is disabled (`timestamps: { createdAt: true, updatedAt: false }`).
- **`applyNotificationTransform`** — wraps `applySerialization` from `@infrastructure/persistence/serialize`; normalizes `_id → id`, drops `__v` on lean reads.
- **`notificationModel`** — the registered Mongoose model entrypoint (`'Notification'`).

## Relationships

- **`src/types/index.ts`** — imports `Notification`, `NotificationAudience`, `NotificationSeverity`; the code/params union and severity/audience enums are derived from these.
- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, consumed by `applyNotificationTransform`.
- **`src/modules/notifications/repository.ts`** — owns all queries against `notificationModel`; this file only defines the schema and model.
- **`src/modules/notifications/factories.ts`** — constructs `NewNotification` documents using the same `NotificationBody` union; the comment notes the type is "a promise kept by the writers."
- **`src/modules/notifications/staff-routing.ts`** — writes staff rows (sets `tenantId`, `sets`, `dedupeKey`, `expiresAt`); relies on the unique partial index for upsert-deduplication.
- **`src/modules/shop-tasks/staff-routing.ts`** — another writer of staff notifications; shares the `dedupeKey` convention (`<kind>:<entity>`).
- **`src/modules/notifications/services/inbox.ts`** — reads via the compound `{ userId, createdAt }` index.
- **`src/modules/notifications/index.ts`** — barrel re-export surface for the module.
- **`src/modules/notifications/presenter.ts`** — maps a `NotificationDocument` to a wire shape; consumes `code` + `params` as typed.

## Notes

- `params` is `Mixed` at the DB level. The compile-time union (`NotificationBody`) is only enforced by TypeScript at write/read sites; the database will accept any JSON blob. Writers in `factories.ts` are the gatekeepers.
- The schema type is written out explicitly (not inferred) because the code union grew past what TypeScript can serialize for an inferred type (TS7056). If adding a new code variant, the explicit type must be updated alongside the contract in `@types`.
- The `code` field is intentionally an open set (plain `String`, not an enum) so that a new module can introduce a code without editing this file.
- The partial unique index means rows *without* a `dedupeKey` (personal/`own` notifications) are never subject to the uniqueness constraint — collisions on "absence" are impossible by design.
- The TTL index only fires on rows that have `expiresAt` set; `own`-audience rows carry no `expiresAt` and persist until deleted explicitly.
