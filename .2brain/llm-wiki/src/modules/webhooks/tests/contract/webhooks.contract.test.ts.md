---
source: src/modules/webhooks/tests/contract/webhooks.contract.test.ts
sha256: 0554ee25b871d0daafd6344e2dfcd92fe7682ece4bb3d9e2d39d9e71cbb5216c
generated_at: 2026-11-08T09:07:57.245086+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/contract/webhooks.contract.test.ts

## Purpose

Contract tests that validate the `/webhooks` admin HTTP surface—subscriptions CRUD, delivery log, replay, and the public event catalogue—against the bundled `openapi.yaml` schema. The file ensures that response shapes, status codes, error bodies, and field-level rules (e.g. secrets never returned in lists) stay in sync with the published API contract.

## Key elements

- **`subscriptionBody(overrides?)`** – Local factory that returns a minimal valid subscription payload pointed at `https://example.test/inbox` (a URL never actually called).
- **`describe('GET /webhooks/subscriptions')`** – Asserts the list never exposes `secret`/`newSecret`, carries per-row `actions`, honours `?sort=url`, and 422s an unlisted sort field.
- **`describe('GET /webhooks/subscriptions/:id')`** – Single-fetch shape parity with list rows; 404 for unknown, malformed, and foreign-tenant IDs; 403 for a caller lacking the read key.
- **`describe('POST /webhooks/subscriptions')`** – Creation returns a one-time `whsec_…` secret; rejects `http://` URLs, empty `eventTypes`; 409 with `WEBHOOK_SUBSCRIPTION_LIMIT_REACHED` once `NODE_WEBHOOK_SUBSCRIPTION_CAP` is hit.
- **`describe('PUT /webhooks/subscriptions/:id')`** – Full-replace semantics (omitted fields cleared); 422 when `enabled` is present (dedicated endpoints own that toggle); 422 for missing required fields; 404 for out-of-scope IDs.
- **`describe('PATCH /webhooks/subscriptions/:id')`** – Partial-update semantics (omitted fields preserved); same `enabled`-field rejection as PUT.
- *(Truncated portion)* – Additional suites covering the delivery log, replay, and the public event catalogue (`declaredWebhookEvents`).

## Relationships

- **`tests/support/contract.ts`** – Imported as a side-effect (`import '@tests/contract'`); wires up OpenAPI schema validation so every HTTP response is checked against `openapi.yaml`.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises and tears down an isolated MongoDB instance for each run.
- **`tests/support/http.ts`** – Provides the `api()` supertest wrapper and `authenticateAsRole()` for role-scoped bearer tokens.
- **`tests/support/environment.ts`** – `setEnvironment()` lets tests override process env (e.g. `NODE_WEBHOOK_SUBSCRIPTION_CAP`) without touching real config.
- **`tests/support/webhook-events.ts`** – Exports `declaredWebhookEvents` used to cross-check the event catalogue endpoint against the canonical list.
- **`src/modules/webhooks/repository.ts`** – `webhookSubscriptionRepository` is used directly to seed a foreign-tenant document (404 test) and to verify persistence; `webhookDeliveryRepository` is available for delivery-log/replay suites.
- **`src/infrastructure/adapters/ssrf-exemptions.ts`** – `registerSsrfExemptOrigin` / `clearSsrfExemptOrigins` allow test URLs to pass the SSRF guard during request construction without a real outbound call.

## Notes

- **No real deliveries ever occur.** The subscription URL (`example.test`) is a placeholder; these tests exercise the admin read/write path only.
- **`enabled` is intentionally rejected on PUT and PATCH.** Enabling/disabling a subscription is owned by dedicated endpoints; sending the field is a contract violation (422).
- **Path aliases** (`@tests/*`, `@infrastructure/*`) are used throughout; resolve them via `tsconfig` paths when navigating from this file.
- **The `enabled` default is `true`** on creation; the one-time secret (`whsec_…` prefix) is returned only on the POST response and never in subsequent GET/PUT/PATCH payloads.
