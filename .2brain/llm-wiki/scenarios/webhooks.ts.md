---
source: scenarios/webhooks.ts
sha256: 3757a2d3e9800181d6189118af8db526c88d06025aac28f5d96b53305fa84405
generated_at: 2026-11-08T02:36:38.865270+00:00
model: ollama:qwen3.8:27b
---

# scenarios/webhooks.ts

## Purpose

Seeds a single demo webhook subscription (pointing at a `webhook-tester` sink) as part of the `shopModules` fixture table. It is inert by default: when `NODE_WEBHOOK_DEMO_SINK_URL` is unset (the common case), it seeds nothing and produces no log noise. When the sink URL is set (via the `integrations` Docker profile or the frontend's Cypress listener), it upserts one subscription so a developer can watch deliveries in `webhook-tester` without manually creating a session first.

## Key elements

- **`seedWebhooksCollection`** — The seed function. Reads `demoSinkConfig().NODE_WEBHOOK_DEMO_SINK_URL`; returns `[]` if unset. Otherwise builds a `WebhookSubscriptionDocument` literal (fixed `_id`, `eventTypes: ['*']`, one ring entry) and upserts it via `insertIfAbsent`. Returns `Promise<SeedOutcome[]>`.
- **`shopModule`** — Exports `{ seed: seedWebhooksCollection }` for registration in the generated `shopModules` table (`scenarios/shop-modules.generated.ts`).
- **`WEBHOOK_SUBSCRIPTION_ID`** — Fixed ObjectId (`65e0…00a1`) used as `_id`; makes re-seeding a no-op.
- **`WEBHOOK_SESSION_ID`** — Fixed UUID that `webhook-tester`'s `AUTO_CREATE_SESSIONS=true` will materialise on first POST, so `GET /api/session/<uuid>/requests` works out of the box.
- **`WEBHOOK_DEMO_SECRET_ID` / `WEBHOOK_DEMO_SECRET`** — Fixed ring-entry UUID and Standard-Webhooks-shaped secret whose base64 half decodes to a human-readable string. Chosen deliberately so the plaintext is known (a `mintRingSecret()` value would be unrecoverable).

## Relationships

- **`scenarios/config.ts`** — Calls `demoSinkConfig()` to read `NODE_WEBHOOK_DEMO_SINK_URL` from the environment.
- **`scenarios/seed.ts`** — Uses `insertIfAbsent` (upsert-if-not-present helper) and the `SeedOutcome` type.
- **`src/kernel/access/tenant.ts`** — Imports `DEPLOYMENT_TENANT_ID` to scope the subscription to the deployment tenant.
- **`src/modules/webhooks/model.ts`** — Imports `WebhookSubscriptionDocument` as the type for the fixture literal.
- **`src/modules/webhooks/repository.ts`** — Passes `webhookSubscriptionRepository` to `insertIfAbsent` for the actual DB write.
- **`src/modules/webhooks/secrets.ts`** — Calls `encryptRingSecret` to produce the ciphertext half of the ring entry.
- **`tests/integration/scenarios/webhooks-seed.test.ts`** — Integration test exercising the seed (and the no-op path when the env var is absent).

## Notes

- The secret is **fixed plaintext**, not a `mintRingSecret()` result, because `secrets.ts` only exposes the plaintext in the mint response; a generated secret could never be handed to `webhook-tester` for signature verification. This is demo-only and must never back a production ring.
- The URL is always `https://` (even for loopback) so the subscription's edit form accepts it. The SSRF guard (`@infrastructure/adapters/ssrf-guard`) whitelists the sink's origin in the dev preload; every other loopback address is refused.
- Neither `createdAt`/`updatedAt` on the subscription nor on the ring entry are set in the literal — Mongoose's `{ timestamps: true }` / `{ timestamps: { createdAt: true }` stamps them at insert time.
- The trailing-slash strip on `sinkBaseUrl` (`replace(/\/+$/, '')`) prevents double slashes when the session UUID is appended.
