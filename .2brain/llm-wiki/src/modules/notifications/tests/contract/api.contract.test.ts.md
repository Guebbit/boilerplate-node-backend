---
source: src/modules/notifications/tests/contract/api.contract.test.ts
source_sha256: 11157c6a01610e53eeaf932dcccda5f3ad0b517fcc66b84d5f6bf11dcad7765f
context_sha256: 433b12513194471f2180c6d66262da2a4fc28906ca070fcd5c2cd2a476654d74
generated_at: 2026-11-22T05:57:09.878155+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `/notifications` HTTP routes. Every route answers either the inbox shape or a 204 with no body, so the tests make sure each contract branch, including the refusals, is reached over HTTP. Ownership and cap rules are covered in the integration suite instead. `GET /notifications/stream` is an endless SSE stream, and the tests read it only as far as the one frame each needs.

## Key elements
- `setupTestDb()`: called at module level to set up the test database.
- `MALFORMED_ID`: an id no ObjectId can be built from. Id-taking routes answer it the same way as an unknown id.
- `describe` blocks, by route:
  - `GET /notifications`: covers an empty inbox, an inbox with a read and an unread notification, and each variant of the notification union with its own params.
  - `GET /notifications for a work notice`: covers staff-audience notices.
    - A member holding the required sets sees both staff variants. Each item has `audience: 'staff'`, and the response does not leak the set names such as `TaskManagement`.
    - When the caller no longer holds the sets, the list is empty and fetching the notice by id returns 404.
  - `POST /notifications/read-all`: returns 204 and sets `readAt` on the caller's notifications.
  - `DELETE /notifications`: returns 204 and empties the caller's inbox.
  - `DELETE /notifications?audience=`: `own` empties only that audience and leaves the staff row. An unknown value such as `everyone` returns 422.
  - `GET /notifications/{id}`: returns 200 for the caller's own notification. It returns 404, never 403, for someone else's notification, an unknown id, or a malformed id.
  - `DELETE /notifications/{id}`: returns 204 for the caller's own notification and 404 for someone else's or an unknown one.
- `untilEvent(event, onOpen)`: a supertest response parser for the SSE stream.
  - It accumulates chunks and destroys the stream once a frame for `event` has fully arrived (text ending in a blank line).
  - `onOpen` runs once the headers are in, which is when the stream is registered. A notification written from it must be delivered by the stream.
  - A rejected `onOpen` is passed to the callback as the error.
- `sessionCookie(identity)`: creates a `customer` user, logs in via `POST /account/login`, and returns the user and the `__Host-session` cookie. This is the credential `EventSource` can carry.
- `describe('GET /notifications/stream')`: starts with a session-cookie test that expects an event stream carrying a new notification. The prompt cuts the file off partway through this test.

## Relationships
- `tests/support/http.ts`: provides `api()` (the HTTP client) and `authenticateAs(role)`, which returns `bearer` and `user`.
- `tests/support/setup-test-db.ts`: provides `setupTestDb`.
- `tests/support/cookies.ts`: `setCookie` reads the `__Host-session` cookie from the login response.
- `tests/support/ids.ts`: `MISSING_ID` is a well-formed id that matches no record.
- `tests/support/contract.ts`: imported for its side effects via `@tests/contract`, which presumably registers the contract matchers.
- `src/modules/notifications/tests/factories.ts`: `createNotification` seeds inbox rows with options such as `userId`, `readAt`, `body` and `staff`.
- `src/modules/users/tests/factories.ts`: `createUser` and `PLAIN_PASSWORD` create other users and perform logins.
- `src/modules/notifications/model.ts`: exports `notificationModel`, which the audience-delete test uses to count remaining documents per audience.
- `src/kernel/access/tenant.ts`: `DEPLOYMENT_TENANT_ID` is used as the tenant on staff notices.
- `src/modules/notifications/services/index.ts`: `notificationsService` is imported. It is not used in the visible portion, which is presumably the part that writes notifications for the stream tests.
- `src/infrastructure/adapters/logger.ts`: no use is visible in the shown portion.

## Notes
- Cross-user access answers 404 rather than 403, so the existence of other users' notifications is not revealed.
- The `sessionCookie` doc comment mentions a `jwt` cookie, but the code uses `__Host-session`.
- A single `describe` titled "GET /notifications" covers several shapes. Within it, `toSorted()` is used to make the union-variant assertion order-independent.
