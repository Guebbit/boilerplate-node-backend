---
source: src/modules/notifications/tests/contract/api.contract.test.ts
sha256: 98ed25730fd9b84f986bbb0e7cafb15751ca2f600533b51980b64d85ee262e8f
generated_at: 2026-10-29T04:32:09.684318+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/contract/api.contract.test.ts

## Purpose

Contract tests that verify each `/notifications` HTTP route returns one of exactly two shapes — a 200 inbox payload or a 204 with no body — plus the expected refusal codes (401, 404). The file also exercises the SSE stream endpoint by reading a single frame. Ownership and cap rules are deliberately excluded (they live in the integration suite); this suite only confirms that every contract branch is reachable over HTTP.

## Key elements

- **`describe('GET /notifications')`** — asserts empty inbox, populated inbox (read + unread), and one test per notification-code variant with their distinct param shapes.
- **`describe('GET /notifications for a work notice')`** — verifies staff-audience notifications are visible only to callers holding the required permission sets; a caller who has lost those sets gets an empty inbox / 404.
- **`describe('POST /notifications/read-all')`** — confirms 204 and that a subsequent GET shows `readAt` populated.
- **`describe('DELETE /notifications')`** — confirms 204 and an empty inbox afterwards.
- **`describe('GET /notifications/{id}')`** — happy path, 404 for another user's row (never 403), 404 for unknown and malformed ids, 401 for anonymous.
- **`describe('DELETE /notifications/{id}')`** — happy path plus 404 for foreign, unknown, and malformed ids.
- **`describe('GET /notifications/stream')`** — opens an SSE connection using a `__Host-session` cookie, waits for a single `notifications.created` frame, then destroys the stream.
- **`untilEvent(event, onOpen)`** — helper that adapts a supertest `IncomingMessage` into a promise-like callback, resolving once the named SSE frame has been received and the double-newline terminator is present.
- **`sessionCookie(identity)`** — creates a user, performs a real login via `POST /account/login`, and extracts the `__Host-session` cookie (the only credential `EventSource` can carry).
- **`MALFORMED_ID`** — a string that cannot parse as an ObjectId; used to assert malformed-id handling matches unknown-id handling (404).

## Relationships

- **`tests/support/contract.ts`** — imported for side effects (`@tests/contract`); registers shared contract assertions or matchers used across the suite.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module load to prepare a clean database.
- **`tests/support/http.ts`** — provides `api()` (supertest instance) and `authenticateAs()` (bearer-token auth helper).
- **`tests/support/cookies.ts`** — `setCookie()` parses the `Set-Cookie` header from the login response to extract the session token.
- **`tests/support/ids.ts`** — `MISSING_ID` supplies a canonical non-existent ObjectId for negative tests.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` identifies the tenant context for staff-scoped notifications.
- **`src/modules/users/tests/factories.ts`** — `createUser()` and `PLAIN_PASSWORD` seed user accounts for auth.
- **`src/modules/notifications/tests/factories.ts`** — `createNotification()` seeds rows directly in the DB.
- **`src/modules/notifications/services/index.ts`** — `notificationsService.create()` is called inside the SSE `onOpen` callback to push a live event into the open stream.

## Notes

- The file is a **contract** suite, not an integration suite: it deliberately skips ownership/cap logic to keep the surface small and stable.
- `untilEvent` treats the supertest response as a raw `IncomingMessage`; it relies on the SSE terminator `\n\n` to know a frame is complete. A rejected `onOpen` rejects the callback with the error, simulating a dropped connection.
- The SSE test uses `buffer(true).parse(untilEvent(...))` on supertest — the custom parser intercepts the stream before supertest buffers it, which is the only way to read a non-terminating response.
- `__Host-session` is the sole credential for the stream because `EventSource` cannot set custom headers; the test performs a real login to obtain the cookie.
