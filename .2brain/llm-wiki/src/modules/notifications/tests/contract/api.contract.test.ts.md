---
source: src/modules/notifications/tests/contract/api.contract.test.ts
sha256: 396f89651543899811b7e54cb12b91126620ca422ab910d67161d30aeae6db78
generated_at: 2026-10-15T10:52:23.246390+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/notifications` HTTP surface. Each route must answer with one of two shapes — the inbox list or the plain success envelope — and the refusal paths (401, 404) must also match. Ownership and cap rules are deliberately excluded (they live in the integration suite). The SSE endpoint is tested only as far as the first event frame each test needs.

## Key elements

- **`describe('GET /notifications')`** — empty inbox, inbox with read/unread items, union-variant codes with distinct params, and the 401 no-session refusal.
- **`describe('POST /notifications/read-all')`** — verifies `readAt` is populated after the call; 401 without session.
- **`describe('POST /notifications/dismiss-all')`** — verifies the inbox is emptied after the call; 401 without session.
- **`describe('DELETE /notifications/{id}')`** — own row (200), another user's row (404), missing id via `MISSING_ID` (404), malformed id (`MALFORMED_ID`) (404), no session (401).
- **`untilEvent(event, onOpen)`** — supertest `.parse()` callback that reads the raw `IncomingMessage` stream until a `event: <name>` frame (terminated by `\n\n`) appears, then destroys the stream. `onOpen` fires once headers arrive (i.e. the stream is registered).
- **`sessionCookie(identity)`** — creates a user, POSTs `/account/login`, and extracts the `__Host-session` value via `setCookie`. Returns the user record plus the `Cookie` header string.
- **`describe('GET /notifications/stream')`** — SSE happy path (asserts `content-type: text/event-stream` and the first frame's JSON code) and 401 without session.
- **`MALFORMED_ID`** — `'not-an-object-id'`; exercised to confirm malformed ids are treated identically to unknown ones (404).
- **`setupTestDb()`** — called once at module scope to guarantee a clean database before the suite runs.

## Relationships

- **`tests/support/contract.ts`** — side-effect import; registers global contract matchers that the assertions in this file rely on.
- **`tests/support/http.ts`** — provides `api()` (supertest wrapper) and `authenticateAs()` (bearer-token helper) used by every non-SSE request.
- **`tests/support/cookies.ts`** — `setCookie` extracts the `__Host-session` value from a login response inside `sessionCookie`.
- **`tests/support/ids.ts`** — supplies `MISSING_ID` for the "id does not exist" DELETE case.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory test database.
- **`src/modules/users/tests/factories.ts`** — `createUser` and `PLAIN_PASSWORD` seed identities for both bearer-token and cookie-based auth.
- **`src/modules/notifications/tests/factories.ts`** — `createNotification` seeds inbox rows for every non-stream test.
- **`src/modules/notifications/services/index.ts`** — `notificationsService.notificationsCreate` is invoked inside the SSE test's `onOpen` callback to emit a real event on the registered stream.

## Notes

- The SSE test authenticates via **cookie** rather than bearer token because `EventSource` (and the supertest equivalent here) can only carry cookies. The `sessionCookie` helper performs a full login to obtain the `__Host-session` value.
- `buffer(true)` on the SSE request lets supertest accumulate a body even though the stream is infinite; `untilEvent` destroys the stream after the first matching frame so the response resolves.
- Malformed id and missing id both assert **404**, not 400 — the API treats unparseable ids as not-found.
- Ownership (deleting another user's notification) and notification-count caps are intentionally absent; they are covered by the integration test suite.
