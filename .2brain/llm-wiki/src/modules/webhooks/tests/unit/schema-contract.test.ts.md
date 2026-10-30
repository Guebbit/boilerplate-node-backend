---
source: src/modules/webhooks/tests/unit/schema-contract.test.ts
sha256: 455ff7b2ca9be75350ad63012dd186b55c1537269a5281f0b16990f8aa2207ae
generated_at: 2026-10-29T06:33:12.756319+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/schema-contract.test.ts

## Purpose

Validates the *declarations* of `webhookSubscriptionSchema` and `webhookDeliverySchema` (required paths, defaults, sub-schema options, index specs, index options, enums, timestamps) by reading the Mongoose schema objects directly. This exists because integration tests that only ever save valid fixtures cannot detect a dropped `required`, a flipped default, or a TTL index silently detached from its config source.

## Key elements

- **`DELIVERY_RETENTION_SECONDS`** — module-level constant computed from `currentEnvironment().NODE_WEBHOOK_DELIVERY_RETENTION_DAYS` (fallback `30`), converted to seconds. Used to assert the TTL index value so the test tracks config changes automatically.
- **`describe('webhookSubscriptionSchema')`** — asserts required paths (`consecutiveFailures`, `eventTypes`, `tenant`, `url`), absence of an `enabled` field, `consecutiveFailures` default `0`, `secrets` default `[]`, `secrets` sub-schema `_id: false`, ring-entry required paths, two compound indexes (both non-unique/non-sparse), and `timestamps: true`.
- **`describe('webhookDeliverySchema')`** — asserts required paths, absence of outcome/lease fields (`responseCode`, `durationMs`, `error`, `nextAttemptAt`, `leaseToken`, `leaseExpiresAt`), `attempt` default `1`, `status` default `'pending'`, the four-value `status` enum, all seven index specs, `createdAt_1` carrying `expireAfterSeconds` (TTL), `subscriptionId_1_eventId_1` being the sole unique index, ascending `createdAt` direction for the TTL index, and `timestamps: true`.

## Relationships

- **`src/modules/webhooks/model.ts`** — source of `webhookSubscriptionSchema` and `webhookDeliverySchema`, the two objects under test.
- **`tests/support/schema.ts`** — provides the assertion helpers (`requiredPaths`, `defaultOf`, `subSchema`, `optionsOf`, `enumOf`, `indexSpecs`, `indexOptionSpecs`) that read Mongoose schema internals in a test-friendly format.
- **`src/infrastructure/config/store.ts`** — provides `currentEnvironment()` so the TTL assertion is tied to the live config value rather than a hardcoded literal.

## Notes

- The TTL index on `createdAt` **must** be ascending (`createdAt_1`). The same field appears descending in two compound indexes; confusing the directions yields a TTL index that never deletes.
- `secrets` entries have `_id: false` because `secrets.ts` mints its own `id` before save; a Mongoose-auto-generated `_id` would be a redundant second identity.
- No `enabled` boolean exists on the subscription schema — "enabled" is inferred from the *absence* of `disabledAt`/`autoDisabledAt`.
- The only unique index across both schemas is `subscriptionId_1_eventId_1` on delivery; the subscription-level cap is enforced by application logic (`services/subscriptions.ts`), not the database.
