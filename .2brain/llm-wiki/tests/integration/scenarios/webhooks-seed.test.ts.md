---
source: tests/integration/scenarios/webhooks-seed.test.ts
sha256: b5224abef792f958209a75e6719bc41350378fb2252029c7ab2cde5ae46e5689
generated_at: 2026-10-15T12:53:39.757966+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scenarios/webhooks-seed.test.ts

## Purpose

Integration test that verifies the demo webhook seeder (`seedWebhooksCollection`) writes a subscription whose URL is valid under the system's own contract. Specifically, it guards against the seeder producing a record that the application's edit form and `update` service would reject — a "record its own form cannot save" failure. It also confirms the seeder is a no-op when no sink URL is configured.

## Key elements

- **`SINK_URL`** — the loopback address (`https://127.0.0.1:3070`) the sink is expected to listen on, matching the live recipe / `.env-example`.
- **`context`** — caller context (manager role, `DEPLOYMENT_TENANT_ID`) used when exercising the `update` service.
- **`beforeEach`** — sets `NODE_WEBHOOK_DEMO_SINK_URL` and calls `registerWebhookSinkExemption()` so the SSRF guard accepts the loopback origin.
- **`afterEach`** — calls `clearSsrfExemptOrigins()` to reset state between tests.
- **`seededSubscription()`** (local helper) — runs the seeder, then reads back the single written row via `webhookSubscriptionRepository.search`.
- **`describe('seedWebhooksCollection')`** — four assertions:
  - No subscription is created when `NODE_WEBHOOK_DEMO_SINK_URL` is `undefined`.
  - The seeded URL matches `https://127.0.0.1:3070/<uuid>`.
  - The seeded URL passes `UpdateWebhookSubscriptionBody.safeParse`.
  - `update` successfully saves a URL change on the same sink host.

## Relationships

- **`scenarios/webhooks.ts`** — source of `seedWebhooksCollection`, the function under test.
- **`scenarios/support/doubles/webhook-sink.ts`** — provides `registerWebhookSinkExemption`, called in `beforeEach` to whitelist the loopback origin for SSRF checks.
- **`src/infrastructure/adapters/ssrf-exemptions.ts`** — provides `clearSsrfExemptOrigins`, called in `afterEach` to reset the exemption list.
- **`src/kernel/access/tenant.ts`** — provides `DEPLOYMENT_TENANT_ID`, the tenant under which the seeder writes and the `update` call runs.
- **`src/modules/webhooks/repository.ts`** — provides `webhookSubscriptionRepository`, used to read back the seeded row.
- **`src/modules/webhooks/services/subscriptions.ts`** — provides `update`, exercised to prove the seeded URL is editable.
- **`tests/support/callers.ts`** — provides `callerAs('manager')` for the edit context.
- **`tests/support/environment.ts`** — provides `setEnvironment` to toggle the sink URL env var per test.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, invoked once at module scope to prepare the database.

## Notes

- `setupTestDb()` runs at module level (outside any `describe`/`beforeEach`), so the database is initialised once for the entire file.
- The SSRF exemption is only registered in `beforeEach` when a sink URL is set; the "no sink" test relies on the exemption being irrelevant because no URL is written.
- The UUID in the seeded URL is a 36-char hex/dash string; the regex in the test pins that shape, so a change to the seeder's ID format would fail the assertion.
