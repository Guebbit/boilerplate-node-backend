---
source: scenarios/webhooks.ts
sha256: b35391ccd55f095c9b15a0be8e91a57ecb288326dfe0080e272bae574a0418f4
generated_at: 2026-09-23T17:20:59.775001+00:00
model: ollama:qwen3.8:27b
---

# scenarios/webhooks.ts

## Purpose

The webhooks module's slice of the demo dataset. Seeds a single webhook subscription pointing at a `webhook-tester` Docker service (from the `integrations` compose profile) so a developer can watch captured deliveries in a browser. It is inert by default: when `NODE_WEBHOOK_DEMO_SINK_URL` is unset, the function resolves immediately with no inserts, so no dead subscription appears in production logs.

## Key elements

- **`seedWebhooksCollection`** — The single exported seeding function. Reads `NODE_WEBHOOK_DEMO_SINK_URL`; if unset, returns `[]`. Otherwise upserts one `WebhookSubscriptionDocument` (wildcard `eventTypes`, `enabled: true`, one ring secret entry) via `insertIfAbsent`.
- **`WEBHOOK_DEMO_SECRET`** — Exported, fixed plaintext secret (Standard-Webhooks `whsec_…` shape). Deliberately not minted by `mintRingSecret()` so it remains readable for signature verification against captured deliveries. Documented in `.env-example`.
- **`WEBHOOK_SUBSCRIPTION_ID`** / **`WEBHOOK_SESSION_ID`** / **`WEBHOOK_DEMO_SECRET_ID`** — Fixed identifiers. The session UUID is the path segment `webhook-tester` auto-creates (via `AUTO_CREATE_SESSIONS=true`) on first POST, making the subscription watchable without a human obtaining a session first.

## Relationships

- **`scenarios/index.ts`** — Declares `seedWebhooksCollection` in the `shopModules` table; `seedShop` walks and invokes it.
- **`scenarios/seed.ts`** — Supplies `insertIfAbsent` (idempotent upsert helper) and the `SeedOutcome` type used in the return value.
- **`src/modules/webhooks/model.ts`** — Provides the `WebhookSubscriptionDocument` type (and the `{ timestamps: true }` / ring-entry subdocument timestamp behavior the fixture relies on).
- **`src/modules/webhooks/repository.ts`** — Provides `webhookSubscriptionRepository`, the Mongoose repository passed to `insertIfAbsent`.
- **`src/modules/webhooks/secrets.ts`** — Provides `encryptRingSecret`, used to produce the `ciphertext` field of the ring entry. The fixed plaintext is shaped to match `generatePlaintextSecret`'s output.
- **`src/kernel/access/tenant.ts`** — Provides `DEPLOYMENT_TENANT_ID`, the tenant the subscription is seeded under.

## Notes

- The SSRF guard (`@infrastructure/adapters/ssrf-guard`) normally rejects plain-HTTP private-address URLs. The single hostname in this fixture is exempted via `@modules/webhooks/config`'s `getWebhookDemoAllowedHost`, honoured only in development/test.
- `createdAt`/`updatedAt` are omitted from the fixture literal; the Mongoose schema's `timestamps: true` stamps them on insert. A cast to `WebhookSubscriptionDocument` is needed because the literal is a plain object, not a hydrated document.
- `consecutiveFailures` is seeded to `0` to match a freshly-created subscription.
- The secret is **demo-only**; it must never be used for a real ring, and the plaintext is recoverable (unlike a `mintRingSecret()` output, which exists only in the minting response).
