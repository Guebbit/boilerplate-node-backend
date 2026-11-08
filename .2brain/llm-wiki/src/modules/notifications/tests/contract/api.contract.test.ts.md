---
source: src/modules/notifications/tests/contract/api.contract.test.ts
sha256: b24e98057641e78a54d190743315b3cb1dbceb8d2b5b1fcbbc115dcae6563f92
generated_at: 2026-11-08T06:34:42.675934+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/contract/api.contract.test.ts

## Purpose

Contract tests that verify every `/notifications` route returns the correct HTTP status code and response shape, covering all branches (success, 404, 401, 422) over real HTTP. The file exists to pin the API surface so that ownership and cap logic (lived in the integration suite) never accidentally changes the wire contract. SSE (`GET /notifications/stream`) is read only as far as the single frame each test needs.

## Key elements

- **`MALFORMED_ID`** – a string that cannot be parsed as an ObjectId; used to assert that id-taking routes treat it identically to a missing id (404).
- **`describe('GET /notifications')`** – three tests covering empty inbox, mixed read/unread, and the full union of notification body variants (each with its own `params`).
- **`describe('GET /notifications for a work notice')`** – staff-audience notifications with `tenantId`/`sets`; asserts `audience: 'staff'`, that set names are stripped from the response, and that a caller who no longer holds the sets gets 404.
- **`describe('POST /notifications/read-all')`** – 204 + subsequent `readAt` is set.
- **`describe('DELETE /notifications')`** – 204 + inbox emptied.
- **`describe('DELETE /notifications?audience=')`** – audience-scoped delete; unknown audience returns 422; scoped delete leaves other-audience rows intact.
- **`describe('GET /notifications/{id}')`** – single-read, 404-for-others (never 403), 404 for missing/malformed id, 401 for anonymous.
- **`describe('DELETE /notifications/{id}')`** – same matrix as GET-single (204 / 404).
- **`untilEvent(event, onOpen)`** – SSE helper: wraps the supertest `IncomingMessage` stream, accumulates data until `event: <name>` appears followed by `\n\n`, then destroys the stream. Calls `onOpen` once headers arrive (i.e. the stream is registered) so the test can write a notification that the stream must deliver.
- **`sessionCookie(identity)`** – creates a user, performs a real `/account/login`, and returns the `jwt` cookie (the only credential an `EventSource` client can carry). Used by the SSE tests.

## Relationships

- **`tests/support/contract.ts`** – imported as a side-effect (`import '@tests/contract'`); likely registers global matchers or contract-assertion helpers used by every test in this file.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` clears/seeds the test database before the suite runs.
- **`tests/support/http.ts`** – provides `api()` (supertest-style client) and `authenticateAs(role)` (returns a bearer token and a user fixture).
- **`tests/support/cookies.ts`** – `setCookie` helper (referenced in imports for SSE cookie setup).
- **`tests/support/ids.ts`** – exports `MISSING_ID`, a valid-format but non-existent ObjectId used for 404 cases.
- **`src/modules/notifications/tests/factories.ts`** – `createNotification({ userId, body, staff? })` writes a notification row directly into the test DB.
- **`src/modules/users/tests/factories.ts`** – `createUser` and `PLAIN_PASSWORD` for creating authenticated test identities.
- **`src/modules/notifications/model.ts`** – `notificationModel` (Mongoose model) used in post-action assertions (e.g. counting rows by `audience` after a scoped delete).
- **`src/modules/notifications/services/index.ts`** – `notificationsService` imported for any direct service-level setup (e.g. registering an SSE subscriber inside `onOpen`).
- **`src/kernel/access/tenant.ts`** – `DEPLOYMENT_TENANT_ID` constant used to populate `staff.tenantId` on work-notice fixtures.
- **`src/infrastructure/adapters/logger.ts`** – listed as a graph neighbor; no direct import visible in the file body (likely pulled in transitively by the HTTP/SSE test harness or the contract module).

## Notes

- The file deliberately separates **contract** (shape + status code) from **integration** (ownership rules, caps). Do not add business-rule assertions here.
- SSE tests use a raw `IncomingMessage` stream rather than supertest's text-mode response; the `untilEvent` helper is the only place that touches the stream API. If the SSE frame format changes, update `untilEvent` first.
- `sessionCookie` performs a full login round-trip; it is the only way to get the `jwt` cookie that `EventSource` (and thus the browser) can send. Bearer headers are not usable for SSE.
- Malformed-id tests use a local `MALFORMED_ID` constant rather than reusing `MISSING_ID`; the distinction matters: `MISSING_ID` is a well-formed ObjectId that simply doesn't exist, while `MALFORMED_ID` cannot be parsed at all. Both must yield 404 (not 400/500).
- The `audience=everyone` case in the scoped-delete test asserts **422**, not 400 or 404 — this is the contract's chosen refusal code for an invalid enum value.
