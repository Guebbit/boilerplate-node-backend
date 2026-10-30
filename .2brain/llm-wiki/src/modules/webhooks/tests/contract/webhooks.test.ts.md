---
source: src/modules/webhooks/tests/contract/webhooks.test.ts
sha256: 2aff5e75a819e9c17cc7206856d309cf92da0da562223428966ede1f49b7361f
generated_at: 2026-10-29T06:31:31.101949+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/contract/webhooks.test.ts

## Purpose

Contract tests that validate the `/webhooks` admin HTTP surface (subscription CRUD, delivery log, replay, event catalogue) against the bundled `openapi.yaml`. They assert not only status codes and response shapes but also security invariants (secret non-leakage, tenant isolation, role-based access) and business rules (subscription caps, required-field enforcement, sort validation).

## Key elements

- **`subscriptionBody(overrides)`** – factory returning a minimal valid subscription payload (`https://example.test/inbox`, `eventTypes: ['order.paid']`); used by every `POST`/`PUT`/`PATCH` test so the URL is never actually reached.
- **`describe('GET /webhooks/subscriptions')`** – verifies list shape (no `secret`/`newSecret` leakage, `secretIds` array), per-row `actions` object, `?sort=url` ordering, and 422 on unknown sort fields.
- **`describe('GET /webhooks/subscriptions/:id')`** – verifies single-subscription shape, 404 for unknown/malformed IDs, 404 for another tenant's subscription, and 403 for a role without the read key.
- **`describe('POST /webhooks/subscriptions')`** – verifies 201 + one-time `whsec_…` secret, 422 on `http://` URLs, 422 on empty `eventTypes`, and the 409 / `WEBHOOK_SUBSCRIPTION_LIMIT_REACHED` cap (set via `setEnvironment`).
- **`describe('PUT /webhooks/subscriptions/:id')`** – full-replace semantics (omitted fields cleared), 422 when `enabled` is sent inline, 422 on missing required fields, 404 for out-of-reach IDs.
- **`describe('PATCH /webhooks/subscriptions/:id')`** – partial-update semantics (omitted fields preserved), same `enabled`-field rejection as PUT.
- *(file truncated — additional `describe` blocks for delivery log, replay, and event catalogue follow the same pattern.)*

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Side-effect import (`@tests/contract`); registers OpenAPI schema validation so every response is checked against `openapi.yaml` automatically. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` called once at module scope to provision a test database. |
| `tests/support/http.ts` | `api()` builds the supertest-style request; `authenticateAsRole(role)` returns a bearer token for the given role. |
| `tests/support/environment.ts` | `setEnvironment()` temporarily overrides process env vars (e.g. `NODE_WEBHOOK_SUBSCRIPTION_CAP`) for cap tests. |
| `tests/support/webhook-events.ts` | `declaredWebhookEvents` provides the canonical event list used to verify the public event-catalogue endpoint. |
| `src/modules/webhooks/repository.ts` | `webhookSubscriptionRepository` / `webhookDeliveryRepository` used to seed cross-tenant fixtures (e.g. another shop's subscription) and delivery-log rows directly in the DB. |
| `src/infrastructure/adapters/ssrf-exemptions.ts` | `registerSsrfExemptOrigin` / `clearSsrfExemptOrigins` allow or block outbound SSRF checks during tests that would otherwise hit the exemption registry. |

## Notes

- The file is a **contract** test: correctness is anchored to `openapi.yaml`, not to hand-written expectations alone. A schema change that the endpoint no longer satisfies will fail these tests even if the status code is correct.
- All subscription URLs point to `https://example.test/…` deliberately — no real delivery ever occurs. SSRF exemption helpers exist so that any incidental outbound check is cleanly registered/cleared rather than blocked.
- `PUT` vs `PATCH` semantics are tested explicitly: PUT clears omitted fields (full replace); PATCH preserves them (partial merge). The `enabled` field is rejected on **both** because enable/disable has dedicated endpoints.
- Tenant isolation is verified by seeding a foreign subscription via the repository layer and asserting a 404 (not a 403) — the API treats cross-tenant IDs as "not found."
- The file is truncated in this excerpt; the full suite also covers the delivery-log, replay, and event-catalogue endpoints listed in the module docblock.
