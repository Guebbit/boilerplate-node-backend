---
source: scenarios/webhooks.ts
sha256: 3757a2d3e9800181d6189118af8db526c88d06025aac28f5d96b53305fa84405
generated_at: 2026-10-29T01:28:23.033028+00:00
model: ollama:qwen3.8:27b
---

# scenarios/webhooks.ts

## Purpose

Seeds a single demo webhook subscription (pointing at a `webhook-tester` sink) as part of the shop's fixture dataset. It is inert by default: when `NODE_WEBHOOK_DEMO_SINK_URL` is unset (the default), it seeds nothing, avoiding a dead subscription that would auto-disable and clutter logs.

## Key elements

- **`seedWebhooksCollection()`** — Main export. Returns an empty array when the sink URL is unset; otherwise upserts one `WebhookSubscriptionDocument` with a fixed `_id`, tenant, URL, `eventTypes: ['*']`, and a single ring secret.
- **`shopModule`** — Fixture-table entry (`{ seed: seedWebhooksCollection }`) collected into `shop-modules.generated.ts`.
- **`WEBHOOK_SUBSCRIPTION_ID`** — Fixed `ObjectId` literal (`65e…00a1`) ensuring idempotent re-seeding.
- **`WEBHOOK_SESSION_ID`** — Fixed UUID path segment; works because `webhook-tester` with `AUTO_CREATE_SESSIONS=true` creates the session on first POST.
- **`WEBHOOK_DEMO_SECRET_ID`** — Fixed UUID for the ring-secret subdocument.
- **`WEBHOOK_DEMO_SECRET`** — Fixed plaintext secret (`whsec_…`); base64 half decodes to a human-readable string. Deliberately not generated, because `secrets.ts` only returns the plaintext in the mint response.

## Relationships

- **`scenarios/config.ts`** — Provides `demoSinkConfig()` which supplies `NODE_WEBHOOK_DEMO_SINK_URL`.
- **`scenarios/seed.ts`** — Provides `insertIfAbsent` and the `SeedOutcome` type used for idempotent upserts.
- **`scenarios/shop-modules.generated.ts`** — Auto-generated aggregator that imports `shopModule` from this file (regenerated via `npm run regenerate`).
- **`src/kernel/access/tenant.ts`** — Supplies `DEPLOYMENT_TENANT_ID` for the subscription's tenant field.
- **`src/modules/webhooks/model.ts`** — Defines `WebhookSubscriptionDocument` (the type the fixture is cast to) and the subdocument schema for ring secrets.
- **`src/modules/webhooks/repository.ts`** — Provides `webhookSubscriptionRepository` used by `insertIfAbsent`.
- **`src/modules/webhooks/secrets.ts`** — Provides `encryptRingSecret` to produce the ciphertext for the ring entry.
- **`tests/integration/scenarios/webhooks-seed.test.ts`** — Integration test exercising this file's seeding behavior.

## Notes

- **Inert by default:** No env var → empty seed. A developer who never enables the `integrations` Docker profile never sees a phantom subscription.
- **Fixed secret, not generated:** `mintRingSecret()` in `secrets.ts` discards the plaintext after the mint response; a generated secret could never be handed to `webhook-tester` for signature verification. This file hard-codes one instead.
- **HTTPS required:** The URL scheme must be `https://` for the edit form to accept it. Reachability depends on an SSRF-guard exception registered in `scenarios/support/doubles/webhook-sink.ts` (loopback origin allow-list).
- **No explicit timestamps:** The fixture omits `createdAt`/`updatedAt`; Mongoose `timestamps: true` on the schema stamps them at insert time.
- **Deletion contract:** Removing this file and running `npm run regenerate` removes its entry from `shop-modules.generated.ts` automatically.
