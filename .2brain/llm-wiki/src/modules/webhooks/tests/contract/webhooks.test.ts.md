---
source: src/modules/webhooks/tests/contract/webhooks.test.ts
sha256: b813aa897400dd749c319ce6bcd7553a690b077438fa2939bb0ff92b885b9176
generated_at: 2026-10-15T12:22:54.960874+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/contract/webhooks.test.ts

## Purpose

Contract tests that exercise the `/webhooks` admin REST surface (subscriptions CRUD, secret rotation, delivery log, replay, event catalogue) against the bundled `openapi.yaml` schema. The file exists to catch schema/implementation drift without a live server, and to pin down authorization, validation, and state-transition behavior of the webhook API.

## Key elements

- **`subscriptionBody(overrides?)`** – Factory that returns a valid subscription payload (HTTPS URL, `['order.paid']` event type) for use across tests.
- **`describe('GET /webhooks/subscriptions')`** – Verifies 401 (unauthenticated), 403 (no webhook key), and 200 with secret fields stripped from listed items.
- **`describe('POST /webhooks/subscriptions')`** – Verifies 201 creation (one-time `whsec_` secret, defaults), 422 for plain-HTTP URL / empty `eventTypes`, 403 for read-only role, and 422 when `NODE_WEBHOOK_SUBSCRIPTION_CAP` is hit.
- **`describe('PUT /webhooks/subscriptions/:id')`** – Verifies full-replace semantics (omitted `description` is cleared), 422 for missing required field, and 404 for out-of-scope IDs.
- **`describe('PATCH /webhooks/subscriptions/:id')`** – Verifies partial-update semantics, 404 for out-of-scope IDs, re-enable clearing `consecutiveFailures`/`disabledAt`, and that editing an already-enabled sub does **not** reset the failure streak.
- **`describe('POST .../rotate-secret')`** – Verifies the two-secret ring invariant (new + one prior), oldest dropped on second rotation, and 404 for out-of-scope IDs.
- **`describe('DELETE .../secrets/:secretId')`** – (truncated) verifies 404 for unknown `secretId`.
- **`setupTestDb()`** – Called once at module level to provision/tear down the test database.

## Relationships

- **`tests/support/contract.ts`** – Side-effect import (`@tests/contract`); registers the OpenAPI schema and contract-test matchers used by every assertion.
- **`tests/support/setup-test-db.ts`** – Provides `setupTestDb`, which the file calls to manage the test MongoDB lifecycle.
- **`tests/support/http.ts`** – Provides `api()` (HTTP client) and `authenticateAsRole(role)` (bearer-token helper) used in every test case.
- **`tests/support/environment.ts`** – Provides `setEnvironment` to mutate process env vars (e.g. `NODE_WEBHOOK_SUBSCRIPTION_CAP`) within a test.
- **`tests/support/webhook-events.ts`** – Provides `declaredWebhookEvents`, the canonical list of event types the catalogue endpoint must expose.
- **`src/modules/webhooks/repository.ts`** – Provides `webhookSubscriptionRepository` and `webhookDeliveryRepository`; the test uses the former directly to seed/inspect stored state (failure streaks, `disabledAt`) before issuing a PATCH.
- **`src/infrastructure/adapters/ssrf-exemptions.ts`** – Provides `registerSsrfExemptOrigin` / `clearSsrfExemptOrigins`, used to whitelist `example.test` so the SSRF guard does not reject the fixture URL.

## Notes

- Tests **never deliver** a webhook; the fixture URL (`https://example.test/inbox`) is intentionally unreachable.
- Secret-leak assertions (`item.secret` / `item.newSecret` undefined on GET) are a security contract, not just a schema check.
- The subscription-cap test mutates the environment via `setEnvironment`; ensure the contract-support layer restores it between tests (handled by `@tests/contract`).
- The re-enable / failure-streak tests write directly through `webhookSubscriptionRepository` to simulate a delivery-failure state that the API alone cannot produce.
- `resolve4` (node:dns) and mongoose `Types` are imported but their usage falls in the truncated portion (likely the delivery-log or replay describe blocks).
