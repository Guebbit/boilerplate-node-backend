---
source: src/modules/notifications/tests/integration/service.test.ts
sha256: 5f1aa597daf696d5c8dd0e713cf215f84fcdb99b55475925eddf83c1280d4cd6
generated_at: 2026-10-15T10:53:02.711599+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/integration/service.test.ts

## Purpose

Integration tests for the notifications service (`notificationsService`). Verifies the invariants of a user's inbox—ownership isolation, per-user cap enforcement, real-time push to open tabs, and cascade on account deletion—against a real test database rather than unit-level mocks.

## Key elements

- **`setupTestDb()`** — initialises a dedicated Mongo instance for the suite (from `tests/support/setup-test-db`).
- **`jest.mock('@modules/notifications/services/stream', …)`** — wraps the real `publishToUser` in a `jest.fn` so calls are recorded; the factory form is used because `jest.spyOn` cannot redefine the non-configurable CJS namespace property under the swc transform.
- **`inboxOf(userId)`** — helper that calls `notificationsService.notificationsList` and returns the ordered array of notification ids.
- **`aged(userId, minutesAgo)`** — helper that creates a notification with a back-dated `createdAt` so ordering tests never depend on insert timing.
- **`describe('notificationsList')`** — ordering (newest-first), cross-user isolation, empty-inbox shape.
- **`describe('notificationsCreate')`** — bulk write, empty-list no-op, push payload correctness (validated against `NotificationCreatedPayloadSchema`), cap enforcement (oldest evicted, `notifications.deleted` event emitted), per-owner independent trimming.
- **`describe('notificationDelete')`** — owner deletes own row (pushes `notifications.deleted` with `all: false`), intruder gets 404 and row is untouched, non-existent id also 404.
- **`describe('notificationsDismissAll')`** — empties only the owner's inbox, succeeds on already-empty inbox, pushes `{ all: true, ids: [] }`.
- **`describe('notificationsReadAll')`** — stamps `readAt` on the owner's rows, leaves other users' rows unread. *(section truncated in source)*

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/notifications/services/index.ts` | Under test: calls `notificationsService.notificationsList`, `.notificationsCreate`, `.notificationDelete`, `.notificationsDismissAll`, `.notificationsReadAll`. |
| `src/modules/notifications/repository.ts` | Uses `notificationRepository.count()` to assert empty DB; imports `NewNotification` type for parameterised test cases. |
| `src/modules/notifications/services/stream.ts` | Mocked via `jest.mock` factory; `stream.publishToUser` is the sole seam for verifying real-time push events. |
| `src/modules/notifications/tests/factories.ts` | `createNotification` creates seeded rows (optionally aged). |
| `src/modules/users/tests/factories.ts` | `createUser` creates test accounts with distinct emails. |
| `src/infrastructure/runtime/database.ts` | Imports `withTransaction` (used by the service under test to guarantee atomic write + trim). |
| `src/types/index.ts` | `NotificationCreatedPayloadSchema` validates that the push payload conforms to the AsyncAPI contract. |
| `tests/support/setup-test-db.ts` | `setupTestDb` provisions and resets the Mongo instance before the suite. |

## Notes

- The stream mock deliberately avoids `jest.spyOn` because the swc transform used by the mutation-testing pipeline produces a non-configurable namespace property; the factory `jest.mock` with `jest.requireActual` is the workaround.
- The per-user cap (`CAP`) is read from `process.env.NODE_NOTIFICATIONS_MAX_PER_USER` at test time rather than hard-coded, so the suite tracks whatever the environment actually enforces.
- `beforeEach` clears the `publishToUser` mock to prevent cross-test contamination.
- The file is the integration-level counterpart to any unit tests for the service; it exercises the real repository and real database, with only the stream transport stubbed.
