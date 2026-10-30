---
source: src/modules/notifications/tests/integration/service.test.ts
sha256: 52f3a77ddf979365178561a174e8ef01571cd3ae38c71208cfc654316b06cbc2
generated_at: 2026-10-29T04:33:07.695200+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/integration/service.test.ts

## Purpose

Integration tests for the notifications service (`notificationsService`). They verify the safety invariants of a user's inbox—ownership isolation (404, never cross-user delete), the per-user cap with oldest-row eviction, real-time stream pushes to the owner's open tabs, and bulk operations (dismiss-all, read-all)—against a real test database with the stream layer wrapped in a recording mock.

## Key elements

- **`jest.mock('@modules/notifications/services/stream', …)`** – Wraps the real `publishToUser` in a `jest.fn` so calls can be asserted while keeping the real implementation reachable.
- **`setupTestDb()`** – Provisions a clean MongoDB instance per test run (real DB, not in-memory).
- **`inboxOf(userId)`** – Helper that calls `notificationsService.list` and returns the `_id` array, newest first.
- **`aged(userId, minutesAgo)`** – Helper that inserts a notification with a back-dated `createdAt` so ordering tests never depend on insert timing.
- **`describe('notificationsList')`** – Owner sees own rows in order; other users see nothing; empty inbox returns `{ items: [] }`.
- **`describe('notificationsCreate')`** – Batch write, empty-list no-op, stream push payload shape, **AsyncAPI contract validation** via `NotificationCreatedPayloadSchema.safeParse`, per-user cap eviction, per-owner cap isolation, and `notifications.deleted` push on trim.
- **`describe('notificationDelete')`** – Owner delete succeeds and pushes `notifications.deleted`; another user's row → 404 with row untouched; non-existent id → 404.
- **`describe('notificationsDismissAll')`** – Empties only the caller's inbox, succeeds on already-empty inbox, pushes `{ all: true, ids: [] }`.
- **`describe('notificationsReadAll')`** – Stamps `readAt` on all of the owner's rows, leaves others' rows unread, preserves an existing `readAt` value. *(Section truncated in source.)*

## Relationships

- **`src/modules/notifications/services/index.ts`** – The system under test; `notificationsService` is the only service exercised directly.
- **`src/modules/notifications/services/stream.ts`** – Mocked at the module level; `publishToUser` is the assertion target for every "tells the open tabs" scenario.
- **`src/modules/notifications/repository.ts`** – `notificationRepository.count()` is used to assert zero rows after an empty create; `NewNotification` type is imported for the `it.each` payload.
- **`src/modules/notifications/tests/factories.ts`** – `createNotification` seeds rows with controlled `userId`, `createdAt`, `readAt`.
- **`src/modules/users/tests/factories.ts`** – `createUser` seeds distinct user documents per scenario.
- **`src/types/index.ts`** – `NotificationCreatedPayloadSchema` validates the stream payload against the published AsyncAPI contract.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` provisions and tears down the real MongoDB instance.
- **`src/infrastructure/runtime/database.ts`** – `withTransaction` is imported (used by the service under test or by a truncated section).

## Notes

- The stream mock deliberately avoids `jest.spyOn` because the project's swc transform makes the CommonJS namespace object's properties non-configurable, which breaks spy redefinition under mutation testing. The factory-pattern `jest.mock` with `jest.requireActual` + `jest.fn(actual.…)` is the required workaround.
- The per-user cap (`CAP`) is read from `process.env.NODE_NOTIFICATIONS_MAX_PER_USER ?? 100` at test time rather than hard-coded, so the suite tracks whatever value the environment injects.
- All ownership/404 assertions check that the *owner's* row is still present in their inbox and that `publishToUser` was **not** called—ensuring no partial side-effect leaks on a rejected request.
