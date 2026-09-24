---
source: src/modules/webhooks/tests/contract/webhooks.test.ts
sha256: 282801a72d74fdf16dd65b2abee4871a3b5e60ff8b5de01b1d3cabbd38671ac1
generated_at: 2026-09-23T19:43:42.873629+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/contract/webhooks.test.ts

## Purpose

Contract tests for the `/webhooks` admin HTTP surface (subscriptions CRUD, delivery log, replay, and the public event catalogue). Each assertion is paired with a `toSatisfyApiSpec()` check that validates the response body against the bundled `openapi.yaml`, ensuring the live API never drifts from its published spec.

## Key elements

- **`subscriptionBody(overrides?)`** — factory that returns a valid subscription payload pointing at `https://example.test/inbox` (a URL nothing will ever call). Accepts a shallow-merge override map for mutation tests.
- **`describe('GET /webhooks/subscriptions')`** — 401 unauth, 403 for a role without the webhooks key, and a positive list test asserting `secret`/`newSecret` are absent while `secretIds` is present.
- **`describe('POST /webhooks/subscriptions')`** — creation (201, `whsec_` prefix, defaults), 422 for plain-HTTP URL, 422 for empty `eventTypes`, 403 for insufficient role, and 422 when the per-admin subscription cap (env `NODE_WEBHOOK_SUBSCRIPTION_CAP`) is reached.
- **`describe('PATCH /webhooks/subscriptions/:id')`** — secret rotation (ring grows to 2), 422 when removing the last secret id, 404 for an id outside the caller's scope.
- **`describe('DELETE /webhooks/subscriptions/:id')`** — 200 on delete, then re-lists to confirm the record is gone.
- **`describe('GET /webhooks/deliveries')`** — 401, empty-page shape, 422 for an unrecognised `status` filter value.
- **`describe('POST /webhooks/deliveries/:id/replay')`** — 404 for a non-existent delivery id.
- **`describe('GET /webhooks/events')`** — returns exactly the six-event public catalogue; 401 unauth.
- **`setupTestDb()`** — called once at module top-level to seed the test database before any suite runs.

## Relationships

- **`tests/support/contract.ts`** — imported via `import '@tests/contract'`; registers the `toSatisfyApiSpec()` jest matcher used on every response assertion in this file.
- **`tests/support/http.ts`** — provides the `api()` request helper (Supertest-style chain) and `authenticateAsRole(role)` which returns a pre-built bearer token for the given preset role.
- **`tests/support/setup-test-db.ts`** — exports `setupTestDb()`, invoked at module scope to create/reset the in-memory or ephemeral database the tests run against.

## Notes

- No test in this file triggers an actual webhook delivery; the `example.test` TLD URL guarantees zero external I/O.
- The "403 for read-only role" case uses the `customer` role (which has *no* webhooks keys) because no preset role holds `webhooks.any.read` in isolation — the comment in the source flags this as a test-suite limitation.
- The subscription-cap test mutates `process.env.NODE_WEBHOOK_SUBSCRIPTION_CAP` and restores it in a `finally` block; running this file in parallel with other suites that read the same variable could interfere.
- `setupTestDb()` is called once at import time, not per-suite; all suites in this file share that single setup.
