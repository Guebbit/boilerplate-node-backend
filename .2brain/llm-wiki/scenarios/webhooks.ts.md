---
source: scenarios/webhooks.ts
source_sha256: 5e76fe729ed7ff30a6de43f22189801a075eaed4ecd2f5ac0083da01d2021d3b
context_sha256: 1f629a22e6dfbe1826155fb48cb09b4670c0e5f0441d186325138314935b5df6
generated_at: 2026-11-22T01:50:38.782929+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/webhooks.ts

## Purpose
Provides the webhooks module's slice of the demo dataset. It is the one `shopModules` entry that seeds nothing by default: it seeds a single demo webhook subscription pointing at a local sink (`webhook-tester`, or the frontend's Cypress listener) only when `NODE_WEBHOOK_DEMO_SINK_URL` is set. This keeps developers who never enable the `integrations` compose profile from getting a dead subscription that auto-disables in their logs.

## Key elements
- `seedWebhooksCollection()` — returns `Promise<SeedOutcome[]>`. Returns `[]` if the sink URL is unset. Otherwise it builds one subscription fixture and upserts it through `insertIfAbsent`.
- `shopModule` — `{ seed: seedWebhooksCollection }`, this module's entry in the `shop` fixture table.
- Fixed constants:
  - `WEBHOOK_SUBSCRIPTION_ID` is the fixed `_id`, which makes re-seeding a no-op.
  - `WEBHOOK_SESSION_ID` is the fixed session UUID appended to the URL.
  - `WEBHOOK_DEMO_SECRET_ID` is the ring entry id.
  - `WEBHOOK_DEMO_SECRET` is a fixed plaintext `whsec_…` secret that decodes to "demo-webhook-secret-do-not-use-in-production".
- Fixture shape: tenant `DEPLOYMENT_TENANT_ID`, url `<sink base, trailing slashes stripped>/<session id>`, description "Demo sink (webhook-tester)", `eventTypes: ['*']`, `consecutiveFailures: 0`, and one encrypted ring secret.

## Relationships
- `scenarios/config.ts` — `demoSinkConfig()` supplies `NODE_WEBHOOK_DEMO_SINK_URL`.
- `scenarios/seed.ts` — provides `insertIfAbsent` and the `SeedOutcome` type.
- `src/kernel/access/tenant.ts` — provides `DEPLOYMENT_TENANT_ID`, used as the subscription's tenant.
- `src/modules/webhooks/repository.ts` — `webhookSubscriptionRepository` is the target of the insert.
- `src/modules/webhooks/secrets.ts` — `encryptRingSecret` encrypts the demo secret into the ring entry's `ciphertext`.
- `tests/integration/scenarios/webhooks-seed.test.ts` — the integration test for this seed.
- Collected into `shopModules` (`./shop-modules`) and run by `seedShop`. `npm run regenerate` picks it up, so deleting this file removes the entry.

## Notes
- The secret is fixed rather than made by `mintRingSecret()`. A minted plaintext exists only in the response that minted it, so the seed could never give it to `webhook-tester` for signature checks. It is demo-only, and `.env-example` documents it next to `NODE_WEBHOOK_DEMO_SINK_URL`.
- The URL uses `https://` so the edit form can save it. It is reachable only because the development doubles (`scenarios/support/doubles/webhook-sink.ts`) register the sink's origin with `@infrastructure/adapters/ssrf-guard`. That lets this one loopback origin through, and the sink's certificate comes from the test CA in `scenarios/support/tls/`.
- The session id is fixed because `webhook-tester`'s `AUTO_CREATE_SESSIONS=true` creates a session on the first POST, so nobody has to open the UI first.
- `createdAt: new Date()` on the ring entry only satisfies the type. Mongoose keeps a `createdAt` that is given, so this value is the one stored.
- The inert-by-default shape matches `scenarios/support/doubles/mail-outbox.ts`.
