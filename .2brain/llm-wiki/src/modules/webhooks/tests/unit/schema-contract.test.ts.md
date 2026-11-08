---
source: src/modules/webhooks/tests/unit/schema-contract.test.ts
sha256: 7dddd198bb2072d7a20bc35fbaf84e0603c665d8f72bf0ab296a20f0814cfb5b
generated_at: 2026-11-08T09:10:27.672422+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/schema-contract.test.ts

## Purpose

Unit test that asserts the **declarative contract** of the two Mongoose schemas (`webhookSubscriptionSchema`, `webhookDeliverySchema`) — required paths, defaults, enums, index specs, and index options — by reading the schema objects directly. It exists because structural drift (a dropped `required`, a flipped default, a TTL index detached from the configured retention window) does not change what a *valid* document looks like, so document-based integration tests cannot detect it.

## Key elements

- **`DELIVERY_RETENTION_SECONDS`** — module-level constant derived from `currentEnvironment().NODE_WEBHOOK_DELIVERY_RETENTION_DAYS` (defaults to 30 days), used to assert the TTL index value so the test tracks the config automatically.
- **`describe('webhookSubscriptionSchema')`** — 7 assertions covering: required fields (`consecutiveFailures`, `eventTypes`, `tenant`, `url`); absence of an `enabled` path; `consecutiveFailures` defaulting to `0`; `secrets` defaulting to `[]`; `secrets` sub-schema `_id: false`; ring-entry required paths (`ciphertext`, `id`); the two compound indexes (`disabledAt+eventTypes`, `tenant+createdAt`); no unique/sparse options on either index; `timestamps: true`.
- **`describe('webhookDeliverySchema')`** — 8 assertions covering: required fields (7 paths); absence of outcome/lease fields until an attempt lands; `attempt` defaulting to `1` and `status` to `'pending'`; the `status` enum (`pending | in_flight | succeeded | exhausted`); all seven index specs; index options (TTL on `createdAt_1`, `unique=true` on `subscriptionId_1_eventId_1`, `(none)` elsewhere); TTL direction must be ascending `createdAt+1`; `timestamps: true`.

## Relationships

- **`src/modules/webhooks/model.ts`** — source of `webhookSubscriptionSchema` and `webhookDeliverySchema`; this test is the primary structural guard for that file.
- **`tests/support/schema.ts`** — provides the introspection helpers (`requiredPaths`, `defaultOf`, `enumOf`, `indexSpecs`, `indexOptionSpecs`, `optionsOf`, `subSchema`) that make the assertions readable.
- **`src/infrastructure/config/store.ts`** — `currentEnvironment` supplies `NODE_WEBHOOK_DELIVERY_RETENTION_DAYS` so the TTL assertion stays in lockstep with the runtime config.

## Notes

- The TTL index assertion uses `DELIVERY_RETENTION_SECONDS` (computed from env), **not** a hard-coded literal. Changing the environment variable moves both the schema policy and this test together.
- The `secrets` sub-schema explicitly sets `_id: false` because `secrets.ts` mints its own `id` before persisting; an auto-assigned Mongoose `_id` would be a redundant second identity.
- `subscriptionId_1_eventId_1` is the **only** unique index across both schemas. The per-tenant subscription cap is enforced in application code (`services/subscriptions.ts`), not at the index level.
- The TTL index must be on `createdAt` **ascending**. Several compound indexes use `createdAt` descending; confusing the two produces a TTL index that silently never expires documents.
- There is no `failed` status in the delivery enum — a failed attempt with retries remaining reverts to `pending`; only `exhausted` is terminal.
