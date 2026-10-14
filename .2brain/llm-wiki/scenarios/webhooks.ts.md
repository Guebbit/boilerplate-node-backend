---
source: scenarios/webhooks.ts
sha256: 45b933d044222a42018984f7b7732ab83f7f6a3b972d5174859fa13a5a6bc4b6
generated_at: 2026-10-14T07:07:23.566542+00:00
model: ollama:qwen3.8:27b
---

# scenarios/webhooks.ts

## Purpose

The webhooks module's slice of the demo dataset. It conditionally seeds a single webhook subscription pointing at a `webhook-tester` sink, but only when `NODE_WEBHOOK_DEMO_SINK_URL` is configured—otherwise it seeds nothing, keeping the demo inert by default.

## Key elements

- **`WEBHOOK_DEMO_SECRET`** — Exported fixed plaintext ring secret (base64-decodes to `"demo-webhook-secret-do-not-use-in-production"`). Exported so tests and docs can use it for signature verification without re-deriving it.
- **`seedWebhooksCollection()`** — Exported seed function. Reads the sink URL from `demoSinkConfig()`, returns `[]` if unset; otherwise upserts one `WebhookSubscriptionDocument` via `insertIfAbsent`.
- **`WEBHOOK_SUBSCRIPTION_ID`** — Fixed ObjectId (`65e0000000000000000000a1`) ensuring re-seeding is a no-op.
- **`WEBHOOK_SESSION_ID`** — Fixed UUID session path appended to the sink URL; `webhook-tester`'s `AUTO_CREATE_SESSIONS` creates it on first delivery.
- **`WEBHOOK_DEMO_SECRET_ID`** — Fixed UUID for the single ring-secret subdocument.

## Relationships

- **`scenarios/config.ts`** — Provides `demoSinkConfig()`, the typed accessor for `NODE_WEBHOOK_DEMO_SINK_URL`.
- **`scenarios/seed.ts`** — Provides `insertIfAbsent` and the `SeedOutcome` type used for idempotent upserts.
- **`scenarios/shop-modules.ts`** — Lists `seedWebhooksCollection` in the `shopModules` table walked by `seedShop`.
- **`src/kernel/access/tenant.ts`** — Supplies `DEPLOYMENT_TENANT_ID` for the fixture's `tenant` field.
- **`src/modules/webhooks/repository.ts`** — Supplies `webhookSubscriptionRepository` passed to `insertIfAbsent`.
- **`src/modules/webhooks/secrets.ts`** — Supplies `encryptRingSecret` to produce the ciphertext for the fixed plaintext secret.
- **`src/modules/webhooks/model.ts`** — Supplies the `WebhookSubscriptionDocument` type used for casting the fixture literal.
- **`tests/integration/scenarios/webhooks-seed.test.ts`** — Integration test that exercises the seed path (both with and without the env var set).

## Notes

- **Inert by default.** No subscription is created unless `NODE_WEBHOOK_DEMO_SINK_URL` is explicitly set, so developers who never enable the `integrations` Docker profile never see a dead subscription auto-disabling.
- **Fixed plaintext, not generated.** The secret is hardcoded rather than produced by `mintRingSecret()` because the plaintext is only returned in the mint response and could never be read back—making it unusable for the sink's signature verification.
- **SSRF guard exception required.** The sink lives on loopback; the dev preload (`scenarios/support/doubles/webhook-sink.ts`) registers that origin with the SSRF guard to allow the one outbound call.
- **No manual timestamps.** `createdAt`/`updatedAt` are omitted from the fixture literal; Mongoose's `timestamps: true` stamps them on insert.
- **URL construction** strips trailing slashes from the sink base URL before appending the session UUID path.
