---
source: tests/integration/scenarios/webhooks-seed.test.ts
sha256: 3554c55dbf57b1734b9a9965ab852da4fed68970461c8d6c0ea64f0cbe3e80a6
generated_at: 2026-10-29T07:02:51.419545+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scenarios/webhooks-seed.test.ts

## Purpose

Guards that the demo webhook subscription written by the seeder (`seedWebhooksCollection`) is a record the application's own edit contract accepts and the service can save. Without this test, a seeder could write a URL that the edit form rejects or the SSRF guard blocks, producing a subscription the product cannot modify.

## Key elements

- **`SINK_URL`** – The loopback `https://` address (`https://127.0.0.1:3070`) the webhook sink listens on in this test environment.
- **`ORIGINAL_ROOTS`** – Snapshot of `tls.getCACertificates('default')` taken at import time so `afterEach` can restore the process-wide CA bundle (required for `--runInBand` / Stryker runners).
- **`context`** – A caller-as-manager context scoped to `DEPLOYMENT_TENANT_ID`, used when exercising the `update` service.
- **`seededSubscription()`** – Helper that calls `seedWebhooksCollection`, then reads back the single document via `webhookSubscriptionRepository.search`, throwing if the seeder wrote nothing.
- **`describe('seedWebhooksCollection')`** – Four tests:
  - Seeding is a no-op when `NODE_WEBHOOK_DEMO_SINK_URL` is unset.
  - The seeded URL matches the expected `https://127.0.0.1:3070/<uuid>` pattern.
  - The seeded URL passes `UpdateWebhookSubscriptionBody.safeParse` (the edit-form schema).
  - Calling `update` with a new path on the same sink host succeeds (SSRF guard allows it because the origin is registered).
- **`beforeEach` / `afterEach`** – Register the sink's SSRF exemption and set the env var before each test; clear exemptions and restore TLS roots after each.

## Relationships

- **`scenarios/support/doubles/webhook-sink.ts`** – Provides `registerWebhookSinkExemption`, which adds the sink's loopback origin to the SSRF exemption list so the `https://` URL passes the guard.
- **`scenarios/webhooks.ts`** – Exports `seedWebhooksCollection`, the function under test that writes the demo subscription row.
- **`src/infrastructure/adapters/ssrf-exemptions.ts`** – Provides `clearSsrfExemptOrigins` used in teardown.
- **`src/kernel/access/tenant.ts`** – Supplies `DEPLOYMENT_TENANT_ID` for the caller context.
- **`src/modules/webhooks/repository.ts`** – Provides `webhookSubscriptionRepository` used to read back the seeded row.
- **`src/modules/webhooks/services/subscriptions.ts`** – Provides `update`, the service whose acceptance of the seeded URL is the core assertion.
- **`tests/support/callers.ts`** – Provides `callerAs('manager')` for the edit context.
- **`tests/support/environment.ts`** – Provides `setEnvironment` to toggle the sink URL env var.
- **`tests/support/setup-test-db.ts`** – Provides `setupTestDb` called at module load to prepare an isolated database.

## Notes

- The test registers an SSRF exemption for the sink origin in `beforeEach`, mirroring what the dev preload script does in production. Without it, the loopback `https://` URL would be rejected by the guard and the `update` test would fail.
- `afterEach` restores the default CA certificates via `tls.setDefaultCACertificates`. This matters for shared-process runners (`--runInBand`, Stryker) where the sink's CA would otherwise leak into subsequent test files.
- The seeder writes directly to the database (bypassing the service), so this test exists to close the gap: a row the database holds but the edit path cannot save is a product bug.
