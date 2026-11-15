---
source: src/modules/webhooks/tests/contract/webhooks.contract.test.ts
sha256: adab212e3f8d08d5c9ae3ad6a67899d147d2a3efa78ab42c33f389844d0c9dcd
generated_at: 2026-11-14T22:48:55.302619+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/contract/webhooks.contract.test.ts

## Purpose

Contract tests for the `/webhooks` admin API surface (subscription CRUD, delivery log, replay, public event catalogue) that validate runtime responses against the bundled `openapi.yaml`. Exists to catch drift between the OpenAPI spec and actual controller/serializer behavior.

## Key elements

- **`subscriptionBody(overrides)`** – Local factory that returns a safe subscription payload pointing at a non-resolvable test host, so no test ever triggers a real delivery.
- **`describe('GET /webhooks/subscriptions')`** – Verifies list shape (no `secret`/`newSecret`, `secretIds` is an array), per-row `actions` object, default vs. `?sort=url` ordering, and 422 on an unlisted sort field.
- **`describe('GET /webhooks/subscriptions/:id')`** – Single-fetch shape parity with list rows; 404 for unknown *and* malformed IDs; 404 (not 403) for a subscription owned by another tenant (seeded directly via the repository).
- **`describe('POST /webhooks/subscriptions')`** – 201 with one-time `whsec_…` secret; 422 for `http://` URL and empty `eventTypes`; 409 with `WEBHOOK_SUBSCRIPTION_LIMIT_REACHED` when the env-configured cap is hit, and success after a delete frees a slot.
- **`describe('PUT /webhooks/subscriptions/:id')`** – Full-replace semantics (omitted `description` is cleared); 422 when body includes `enabled`; 422 when a required field is missing; 404 for out-of-reach IDs.
- **`describe('PATCH /webhooks/subscriptions/:id')`** – Partial-update semantics (omitted fields preserved); same `enabled`-field 422 guard; 404 for out-of-reach IDs.
- **Remaining `describe` blocks** (truncated in view) cover delivery-log, replay, and the public event catalogue endpoints, exercising `declaredWebhookEvents` and `webhookDeliveryRepository`.

## Relationships

- **`tests/support/contract.ts`** – Imported as a side-effect (`import '@tests/contract'`); installs a global interceptor or supertest wrapper that runs each response body through the OpenAPI schema validator.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` called at module top to prepare/tear down the in-memory (or seeded) database per test run.
- **`tests/support/http.ts`** – Provides `api()` (a supertest-like helper bound to the app) and `authenticateAsRole(role)` which returns a `{ bearer }` token.
- **`tests/support/environment.ts`** – `setEnvironment({...})` lets a test override process env vars (used for `NODE_WEBHOOK_SUBSCRIPTION_CAP`).
- **`tests/support/webhook-events.ts`** – Exports `declaredWebhookEvents`, the canonical event list the event-catalogue tests assert against.
- **`src/modules/webhooks/repository.ts`** – `webhookSubscriptionRepository` and `webhookDeliveryRepository` are used directly to seed cross-tenant records that the API must 404 on.
- **`src/infrastructure/adapters/ssrf-exemptions.ts`** – `registerSsrfExemptOrigin` / `clearSsrfExemptOrigins` manage the SSRF allow-list so tests can exercise URL-validation paths with fixture domains.

## Notes

- The test file **never performs a real webhook delivery**; every target URL uses a non-resolvable test domain by design.
- `PUT` is a full replace (absent fields are nulled/cleared), while `PATCH` is a partial update—tests explicitly assert this distinction.
- The `enabled` field is deliberately **rejected** (422) on both PUT and PATCH; enabling/disabling has dedicated endpoints (implied by the `actions.enable`/`actions.disable` booleans).
- Cross-tenant access returns **404, not 403**—tests confirm the API does not leak existence of other shops' subscriptions.
- The one-time secret (`whsec_…`) appears **only** in the 201 POST response; subsequent reads expose `secretIds` (array) but never the plaintext.
- `setEnvironment` mutates process-level state; the cap test relies on this being isolated by the test runner (or restored by `contract.ts` teardown).
