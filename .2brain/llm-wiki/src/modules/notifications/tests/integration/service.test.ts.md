---
source: src/modules/notifications/tests/integration/service.test.ts
sha256: 525ba754ca63476044d2db6a55ff7ecaa6c0cbcec5ab8f326f39f7d485f1dbee
generated_at: 2026-11-08T06:35:10.571233+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/integration/service.test.ts

## Purpose

Integration test suite for the notifications service (`notificationsService`). Validates ownership isolation, newest-first ordering, per-user inbox cap enforcement, real-time stream push on create/delete/dismiss, and audience-scoped bulk dismissal — all against a real database rather than mocks.

## Key elements

- **`jest.mock` on `stream.publishToUser`** – Records calls to the live-push function without replacing it, using a `requireActual` wrapper (workaround for a swc/CJS issue with `jest.spyOn`).
- **`setupTestDb()`** – Boots a real (test) database for every test run.
- **`inboxOf(userId)`** – Helper that calls `notificationsService.list` and returns the ordered array of notification IDs.
- **`aged(userId, minutesAgo)`** – Creates a notification via the factory with a backdated `createdAt` so ordering tests don't depend on insertion speed.
- **`rowsOf(userId)`** – Reads notification documents directly from `notificationModel` (bypasses the service) to inspect raw audience fields.
- **`describe('notificationsList')`** – Ownership (404 semantics via empty list), ordering, empty-inbox response.
- **`describe('notificationsCreate')`** – Bulk insert, empty-array no-op, stream push payload shape, AsyncAPI schema conformance (`NotificationCreatedPayloadSchema.safeParse`), cap trim logic (newest kept, oldest evicted, per-user isolation, `notifications.deleted` push with affected IDs).
- **`describe('notificationDelete')`** – Owner delete + stream push, 404 for foreign-row and non-existent ID, no side-effect on the owner's inbox.
- **`describe('notificationsDismissAll')`** – Bulk clear, idempotent on empty inbox, `notifications.deleted` push with `all: true`.
- **`describe('notificationsDismissAll with an audience')`** – Audience-scoped deletion (`'staff'` vs `'own'`), cross-user isolation.
- **`CAP`** – Read from `NODE_NOTIFICATIONS_MAX_PER_USER` env (default 100); tests use it to construct cap-boundary fixtures.

## Relationships

- **`src/modules/notifications/services/index.ts`** – The system under test; every assertion targets `notificationsService` methods.
- **`src/modules/notifications/services/stream.ts`** – Mocked at module level; tests assert on `publishToUser` call arguments to verify real-time push behavior.
- **`src/modules/notifications/tests/factories.ts`** – Provides `createNotification` and `makeRow` used to seed data and build `NewNotification` payloads.
- **`src/modules/users/tests/factories.ts`** – Provides `createUser` to create distinct owner/intruder accounts.
- **`src/modules/notifications/model.ts`** – `notificationModel` queried directly in `rowsOf` to inspect raw audience fields the service hides.
- **`src/modules/notifications/repository.ts`** – `notificationRepository.count()` used to assert empty-DB state; `NewNotification` type parameterizes the `it.each` block.
- **`src/types/index.ts`** – `NotificationCreatedPayloadSchema` used to validate that the pushed payload satisfies the AsyncAPI contract.
- **`tests/support/setup-test-db.ts`** – Initializes the shared test database.
- **`src/infrastructure/runtime/database.ts`** – `withTransaction` imported (exercised indirectly through the service's write path).

## Notes

- The `jest.mock` wrapper exists because `jest.spyOn` cannot redefine the non-configurable property exposed by a CommonJS namespace import under the SWC transform used by mutation testing. Do not "simplify" it back to `spyOn`.
- Cap tests read the limit from `process.env.NODE_NOTIFICATIONS_MAX_PER_USER` rather than hard-coding 100, so they track whatever the runtime environment actually enforces.
- `aged()` backdates `createdAt` by minutes (not milliseconds) to keep ID ordering deterministic without relying on insert timing.
- The file is truncated in the source snapshot; the audience-scoped `dismissAll` block likely continues with additional cases (e.g., the cross-user check that is cut off).
