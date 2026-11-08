---
source: tests/integration/scenarios/webhooks-seed.test.ts
sha256: 3554c55dbf57b1734b9a9965ab852da4fed68970461c8d6c0ea64f0cbe3e80a6
generated_at: 2026-11-08T09:47:56.385599+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scenarios/webhooks-seed.test.ts

## Purpose

Integration test that verifies the demo's seeded webhook subscription is a *valid, editable* record: the URL the seeder writes must pass the Zod `UpdateWebhookSubscriptionBody` schema and the `update` service must accept it. Guards against a regression where the seeder produces a row the application's own edit form cannot save.

## Key elements

- **`SINK_URL`** (`https://127.0.0.1:3070`) — the loopback address the test sink listens on; mirrors the value in `.env-example`.
- **`ORIGINAL_ROOTS`** — snapshot of `tls.getCACertificates('default')` taken at module load so `afterEach` can restore the process-wide trust store.
- **`context`** — caller context (manager, `DEPLOYMENT_TENANT_ID`) used when invoking the `update` service.
- **`beforeEach`** — sets `NODE_WEBHOOK_DEMO_SINK_URL` and registers the sink's loopback origin as an SSRF exemption (mirrors the dev preload).
- **`afterEach`** — clears SSRF exemptions and restores the original TLS CA bundle via `tls.setDefaultCACertificates` (Node ≥ 24.5).
- **`seededSubscription()`** — calls `seedWebhooksCollection()`, then reads back the single row via `webhookSubscriptionRepository.search` and returns it (throws if absent).
- **`describe('seedWebhooksCollection')`** — four cases: (1) no subscription when the env var is unset, (2) URL matches the expected loopback pattern, (3) URL passes `UpdateWebhookSubscriptionBody.safeParse`, (4) `update` service saves a same-host URL change.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/webhooks.ts` | Imports `seedWebhooksCollection` — the function under test. |
| `scenarios/support/doubles/webhook-sink.ts` | Imports `registerWebhookSinkExemption` to whitelist the loopback origin for SSRF checks. |
| `src/infrastructure/adapters/ssrf-exemptions.ts` | Imports `clearSsrfExemptOrigins` for teardown. |
| `src/kernel/access/tenant.ts` | Imports `DEPLOYMENT_TENANT_ID` for the caller context. |
| `src/modules/webhooks/repository.ts` | Imports `webhookSubscriptionRepository` to read back the seeded row. |
| `src/modules/webhooks/services/subscriptions.ts` | Imports `update` to verify the service accepts an edit on the seeded subscription. |
| `tests/support/callers.ts` | Imports `callerAs` to build the manager caller identity. |
| `tests/support/environment.ts` | Imports `setEnvironment` to toggle `NODE_WEBHOOK_DEMO_SINK_URL`. |
| `tests/support/setup-test-db.ts` | Imports `setupTestDb` to provision a per-file database. |

## Notes

- **TLS cleanup is process-wide.** `tls.setDefaultCACertificates` mutates the Node process, not just the test. The `afterEach` restore is critical when the file runs in a shared process (`--runInBand`, Stryker mutation testing); omitting it would leak the sink's CA into subsequent test files.
- **SSRF exemption is deliberate.** The sink lives on `127.0.0.1`, which the SSRF guard blocks by default. The test registers the exemption the same way the dev preload does, so the `https://` loopback URL passes the guard without weakening the guard itself.
- **No real HTTP traffic.** The tests exercise schema validation and the `update` service path; they do not dispatch a webhook call to the sink.
