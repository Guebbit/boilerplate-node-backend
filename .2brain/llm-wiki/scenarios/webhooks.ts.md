---
source: scenarios/webhooks.ts
sha256: 3566b1abb6de228b95d76ef9cc97edd1195ae17fde0675631f79fa0214c95cbb
generated_at: 2026-11-14T17:19:06.625233+00:00
model: ollama:qwen3.8:27b
---

# scenarios/webhooks.ts

## Purpose

Seeds a single demo webhook subscription (pointing at the `webhook-tester` sink) as part of the `shop` fixture dataset. It is intentionally inert by default: when `NODE_WEBHOOK_DEMO_SINK_URL` is unset it seeds nothing, so developers who never enable the `integrations` docker profile are never left with a dead subscription auto-disabling in their logs.

## Key elements

- **`seedWebhooksCollection`** – The seed function. Reads the sink base URL from `demoSinkConfig()`, returns `[]` immediately if unset. Otherwise upserts one subscription fixture (fixed ObjectId, `*` event types, one ring entry) via `insertIfAbsent`.
- **`shopModule`** – The `{ seed: seedWebhooksCollection }` entry consumed by `scenarios/shop-modules.generated.ts` (regenerated via `npm run regenerate`).
- **`WEBHOOK_SUBSCRIPTION_ID`** – Fixed ObjectId (`65e0000000000000000000a1`) making re-seeds idempotent no-ops.
- **`WEBHOOK_SESSION_ID`** – Fixed UUID used as the path segment in the sink URL; works because `webhook-tester` runs with `AUTO_CREATE_SESSIONS=true`.
- **`WEBHOOK_DEMO_SECRET`** – Fixed Standard-Webhooks-shaped plaintext (`whsec_…`) that decodes to a human-readable string. Chosen over `mintRingSecret()` so the plaintext is knowable for signature-verification copy-paste in the UI.
- **`WEBHOOK_DEMO_SECRET_ID`** – Fixed UUID for the single ring entry's `id` field.

## Relationships

- **`scenarios/config.ts`** – `demoSinkConfig()` supplies the `NODE_WEBHOOK_DEMO_SINK_URL` value that gates whether anything is seeded.
- **`scenarios/seed.ts`** – Provides `insertIfAbsent` (upsert helper) and the `SeedOutcome` return type.
- **`src/kernel/access/tenant.ts`** – `DEPLOYMENT_TENANT_ID` scopes the fixture to the demo tenant.
- **`src/modules/webhooks/repository.ts`** – `webhookSubscriptionRepository` is the Mongoose repository passed to `insertIfAbsent`.
- **`src/modules/webhooks/secrets.ts`** – `encryptRingSecret` encrypts the fixed plaintext into the `ciphertext` field of the ring entry.
- **`tests/integration/scenarios/webhooks-seed.test.ts`** – Integration test that exercises the seed path (likely asserts the inert default and the seeded fixture shape).

## Notes

- The ring entry's `createdAt` is set manually in this file to satisfy the subdocument type; the subdocument's own `timestamps: { createdAt: true }` stamps the same instant on insert—don't remove the explicit field without checking the type.
- The sink URL must be `https://` (every webhook URL is) and the origin must be allow-listed in the SSRF guard (`scenarios/support/doubles/webhook-sink.ts` registers it). The sink is loopback-only; the guard refuses all other loopback addresses.
- The secret is **demo-only** and never meant for a real ring. Its plaintext is documented in `.env-example` next to `NODE_WEBHOOK_DEMO_SINK_URL` so a developer can verify `webhook-signature` headers by hand.
