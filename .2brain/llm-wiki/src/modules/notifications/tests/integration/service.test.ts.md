---
source: src/modules/notifications/tests/integration/service.test.ts
generated_at: 2026-11-22T05:57:39.157918+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/tests/integration/service.test.ts

## Purpose
Integration tests for `notificationsService`, run against a real test database. They check the rules that make a user's notification inbox safe to rely on: it belongs only to its owner (another user's id yields a 404, never a delete), it is bounded by a per-user cap, changes are pushed to the owner's open streams, and the inbox is removed along with the account.

## Key elements
- **`jest.mock` of `services/stream`**: keeps the real module but wraps `publishToUser` in `jest.fn(actual.publishToUser)`, so calls are recorded and the real function still runs. A comment explains that `jest.spyOn` can't redefine the non-configurable property a CommonJS namespace import exposes under the swc transform used by the mutation runs.
- **`setupTestDb()` and `beforeEach`**: set up the test DB, and clear the `publishToUser` mock before each test.
- **`inboxOf(userId)`**: helper returning the ids from `notificationsService.list`, newest first.
- **`aged(userId, minutesAgo)`**: helper that creates a notification with a back-dated `createdAt`, so ordering doesn't depend on insert speed.
- **`rowsOf(userId)`**: helper that reads every row id for a user straight from `notificationModel`, whatever its audience.
- **`describe('notificationsList')`**: covers owner-only visibility, newest-first ordering, and an empty `{ items: [] }` result rather than an error.
- **`describe('notificationsCreate')`**:
  - Writes one row per entry, and does nothing without failing for an empty list.
  - Pushes `notifications.created` to the owner's streams with the full notification.
  - Parametrized check that the pushed payload passes `NotificationCreatedPayloadSchema` (the AsyncAPI contract).
  - No `notifications.deleted` push when the inbox is within the cap.
  - Nested **per-user cap** block:
    - `CAP` is read from `NODE_NOTIFICATIONS_MAX_PER_USER` and defaults to 100.
    - Keeps the newest N and deletes the oldest past the cap.
    - Publishes `notifications.deleted` with `{ all: false, ids }` for the trimmed rows.
    - Trims each owner separately.
- **`describe('notificationDelete')`**: `remove` deletes the owner's row and publishes `notifications.deleted`. For another user's row or a nonexistent id it returns `{ success: false, status: 404 }` with the message "This notification was not found."; for another user's row it also leaves the row in place and publishes nothing.
- **`describe('notificationsDismissAll')`**: empties only the caller's inbox, succeeds on an already-empty inbox, and publishes `{ all: true, ids: [] }`.
- **`describe('notificationsDismissAll with an audience')`**: `dismissAll(userId, 'staff' | 'own')` deletes only the rows of that audience. Staff rows are created with a `staff: { tenantId, sets }` field. The visible content ends partway through this block.

## Relationships
- `src/modules/notifications/services/index.ts`: supplies `notificationsService` (`list`, `create`, `remove`, `dismissAll`), the unit under test.
- `src/modules/notifications/services/stream.ts`: its `publishToUser` is wrapped and asserted on for every push.
- `src/modules/notifications/repository.ts`: `notificationRepository.count()` is used to assert that nothing is written, and the `NewNotification` type is used for the parametrized rows.
- `src/modules/notifications/model.ts`: `notificationModel` is queried directly in `rowsOf`.
- `src/modules/notifications/tests/factories.ts`: `createNotification` seeds rows.
- `src/modules/users/tests/factories.ts`: `createUser` creates owners and other users.
- `tests/support/setup-test-db.ts`: `setupTestDb` provides the database lifecycle.
- `src/types/index.ts`: `NotificationCreatedPayloadSchema` validates the pushed payload.
- `src/infrastructure/runtime/database.ts`: `withTransaction` is imported; no use of it appears in the visible portion.

## Notes
- `makeRow` is called throughout but is not defined or imported in the visible portion of the file.
- The cap tests build up to the cap by seeding `CAP` aged rows and then creating more through the service. They depend on the environment variable matching the service's configured limit.
