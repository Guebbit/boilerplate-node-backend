---
source: src/modules/webhooks/tests/unit/schema-contract.test.ts
sha256: 9fc68bdc0070ca17096c3254e23ee28ece8c4b1d6eab57313570c1fe8d73bc66
generated_at: 2026-09-23T19:45:12.933972+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/schema-contract.test.ts

## Purpose

Schema-contract tests for the two webhook Mongoose schemas (`webhookSubscriptionSchema`, `webhookDeliverySchema`). Instead of saving valid documents, these tests read the schema objects directly, so regressions in `required` flags, defaults, enum sets, index specs, index options (TTL, uniqueness), and sub-schema options are caught even when every integration fixture remains valid.

## Key elements

- **`DELIVERY_RETENTION_SECONDS`** – Module-level constant computed from `NODE_WEBHOOK_DELIVERY_RETENTION_DAYS` (default 30). Used to assert the TTL `expireAfterSeconds` value dynamically so the test tracks the configured retention window.
- **`describe('webhookSubscriptionSchema')`** – Asserts: required paths (`consecutiveFailures`, `enabled`, `eventTypes`, `tenant`, `url`); defaults (`enabled: true`, `consecutiveFailures: 0`, `secrets: []`); sub-schema options (`_id: false` on `secrets`); ring-entry required paths (`ciphertext`, `id`); the two compound indexes and their non-unique/non-sparse options; `timestamps: true`.
- **`describe('webhookDeliverySchema')`** – Asserts: required paths (7 fields); that outcome/lease fields (`responseCode`, `durationMs`, `error`, `nextAttemptAt`, `leaseToken`, `leaseExpiresAt`) have **no** default; defaults (`attempt: 1`, `status: 'pending'`); the `status` enum (`pending`, `in-flight`, `succeeded`, `exhausted`); six index specs; that only the `createdAt_1` index carries `expireAfterSeconds` (equal to `DELIVERY_RETENTION_SECONDS`); that the TTL index is ascending; `timestamps: true`.

## Relationships

- **`src/modules/webhooks/model.ts`** – Source of the two schema objects under test (`webhookSubscriptionSchema`, `webhookDeliverySchema`).
- **`tests/support/schema.ts`** – Provides the introspection helpers this file uses exclusively: `requiredPaths`, `defaultOf`, `enumOf`, `optionsOf`, `subSchema`, `indexSpecs`, `indexOptionSpecs`.

## Notes

- The TTL assertion is **not** a hardcoded number; it is derived from the same env var the model reads, so changing the retention policy moves the test and the schema together.
- Index-uniqueness absence is explicitly tested: the subscription-count cap lives in `services/subscriptions.ts`, not in a unique index. A regression that adds `unique: true` to either subscription index would be caught here.
- The `secrets` sub-schema sets `_id: false` because `secrets.ts` mints its own `id`; a Mongoose-assigned `_id` would create a redundant second identity.
- Outcome/lease fields deliberately have **no** default: their absence encodes "never attempted / never claimed," and a `default` would silently change that semantic.
- The TTL index must be ascending (`createdAt_1`); the same field appears descending in two compound indexes. A flip to `-1` on the TTL index produces an index that never expires documents, and this file guards against that specific confusion.
