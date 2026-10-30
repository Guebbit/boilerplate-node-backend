---
source: src/modules/notifications/model.ts
sha256: 24f0e2beab4707d13b624acf4fc15dc8f02dd69947de32261bec85bfa679e407
generated_at: 2026-10-29T04:28:59.819501+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/model.ts

## Purpose

Defines the persistence contract for notifications: the Mongoose schema, indexes, model, and the full set of TypeScript types that tie each notification `code` to its `params`. Notifications are stored as code + structured params (never as sentences) so the frontend owns all copy and a row survives locale changes.

## Key elements

- **`CODE_TABLE`** – A `satisfies Record<NotificationCode, true>` literal listing every valid code. Acts as a compile-time exhaustiveness check against the contract's `Notification` type.
- **`NOTIFICATION_CODES`** – Runtime array of all codes, used as the schema `enum`.
- **`STAFF_NOTIFICATION_CODES`** – Subset of codes that `./staff-routing` can resolve an audience for.
- **`STAFF_SUMMARY_CODES`** – Staff codes rewritten by the daily digest rather than announced once.
- **`StaffNotificationCode` / `StaffSummaryCode`** – Narrowed literal-union types derived from the arrays above.
- **`NotificationParametersByCode`** – Maps each code to its `params` type (one entry per variant of `Notification`).
- **`NotificationBody`** – Discriminated union (`{ code: C; params: … }`) so narrowing on `code` narrows `params`.
- **`NotificationDocument`** – `NotificationCommon & NotificationBody`; the full document shape.
- **`NotificationModel`** – `Model<NotificationDocument>` for repository typing.
- **`notificationSchema`** – Mongoose schema with three indexes: `{ userId, createdAt }` (inbox order), partial-unique `{ userId, dedupeKey }` (staff upsert), and TTL on `expiresAt` (staff expiry). `updatedAt` is disabled.
- **`applyNotificationTransform`** – Serialization helper (`_id` → `id`, drops `__v`) built via `applySerialization`.
- **`notificationModel`** – The registered Mongoose model (`'Notification'`).

## Relationships

- **`@infrastructure/persistence/serialize`** – Imports `applySerialization` to build `applyNotificationTransform`.
- **`./repository`** – The only consumer of `notificationModel` for queries (per the in-file comment "Queries live in `./repository`").
- **`./factories`** – Builds `NewNotification` objects from the same `NotificationBody` union; the schema's `params: Mixed` is a deliberate gap the factory fills with the correct shape.
- **`./staff-routing`** – Consumes `STAFF_NOTIFICATION_CODES` to find a recipient for work notices.
- **`./services/digest`** – Rewrites rows whose `code` is in `STAFF_SUMMARY_CODES`, using `dedupeKey === code` as the upsert target.
- **`./presenter`** – Consumes `NotificationDocument` for rendering.
- **`./index`** – Barrel re-export.
- **`@types`** – Source of the `Notification` contract type, `NotificationAudience`, and `NotificationSeverity` enums.

## Notes

- `params` is `Schema.Types.Mixed` in the schema. Type safety for params is enforced entirely at write-time by the factories/writers, **not** by Mongoose or the database.
- The partial unique index on `dedupeKey` uses `partialFilterExpression: { dedupeKey: { $type: 'string' } }` so user-facing rows (which have no `dedupeKey`) are excluded from the uniqueness constraint.
- The document type is written out explicitly rather than inferred; the code union exceeds what TypeScript can serialize for an inferred discriminant (TS7056).
- `tenantId`, `sets`, `dedupeKey`, and `expiresAt` are staff-row-only fields; they are absent (or undefined) on user-facing rows.
- A row is written once; the only post-creation mutation is setting `readAt`.
