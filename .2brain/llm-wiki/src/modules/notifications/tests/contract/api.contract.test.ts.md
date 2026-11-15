---
source: src/modules/notifications/tests/contract/api.contract.test.ts
sha256: 11157c6a01610e53eeaf932dcccda5f3ad0b517fcc66b84d5f6bf11dcad7765f
generated_at: 2026-11-14T20:26:26.714706+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/notifications` REST API. Each test asserts a specific HTTP status code and response shape (200 with an items array, 204 with no body, 404, 422) so that every contract branch — including refusals — is verified over a real HTTP round-trip. Ownership and capacity rules are deferred to the integration suite.

## Key elements

- **`MALFORMED_ID`** — a sentinel string (`'not-an-object-id'`) used to exercise the "malformed ObjectId" branch; expected to be handled identically to a valid-but-unknown id (404).
- **`untilEvent(event, onOpen)`** — helper that consumes an endless SSE response stream as a Node `IncomingMessage`, accumulates data until the named event frame (terminated by `\n\n`) appears, then destroys the stream. `onOpen` fires once headers arrive, allowing the test to create the notification that must be delivered.
- **`sessionCookie(identity)`** — performs a real `POST /account/login` and extracts the `__Host-session` cookie value, because `EventSource` can only carry cookie credentials (not a bearer header).
- **`describe` blocks** — one per endpoint: `GET /notifications`, `POST /notifications/read-all`, `DELETE /notifications`, `DELETE /notifications?audience=`, `GET /notifications/{id}`, `DELETE /notifications/{id}`, `GET /notifications/stream`.

## Relationships

- **`tests/support/contract.ts`** — imported for side-effect (likely registers global matchers or contract helpers).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module level to provision a fresh database before any test runs.
- **`tests/support/http.ts`** — provides `api()` (supertest instance) and `authenticateAs()` (bearer-token auth for non-SSE routes).
- **`tests/support/cookies.ts`** — `setCookie` extracts a named cookie from a login response.
- **`tests/support/ids.ts`** — `MISSING_ID` sentinel for "id not found" assertions.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` used when seeding staff-audience notifications with a tenant/sets binding.
- **`src/modules/users/tests/factories.ts`** — `createUser` and `PLAIN_PASSWORD` for spinning up test accounts.
- **`src/modules/notifications/services/index.ts`** — `notificationsService` imported (available for direct service calls if needed).
- **`src/modules/notifications/tests/factories.ts`** — `createNotification` seeds rows directly into the DB.
- **`src/modules/notifications/model.ts`** — `notificationModel` used to assert post-condition row counts after audience-scoped deletes.

## Notes

- **Ownership = 404, never 403.** Both `GET /notifications/{id}` and `DELETE /notifications/{id}` return 404 when the notification belongs to another user. This is an intentional information-leak guard, not a permission denial.
- **SSE stream is read and then destroyed.** The `untilEvent` helper tears down the socket (`stream.destroy()`) after the first matching frame; the test never relies on the stream staying open.
- **`audience` query param is validated.** `DELETE /notifications?audience=everyone` returns 422; only `own` and `staff` are accepted.
- **Staff notifications with lost sets are invisible, not 403.** A user who no longer holds the `sets` referenced by a staff notification sees 404 on single-fetch and an empty inbox on list — the record still exists in the DB.
- **The SSE test** sets the `Cookie` header (not `Authorization`) because browser `EventSource` cannot send bearer tokens.
