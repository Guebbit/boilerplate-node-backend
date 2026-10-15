---
source: src/modules/webhooks/tests/unit/schema-contract.test.ts
sha256: db5708222388e2e210059c73eaa4f0845cc16b5a6a74f1a5955aa826a6755f98
generated_at: 2026-10-15T12:25:07.007227+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/schema-contract.test.ts

## Purpose

Validates the *declarations* of the two webhook Mongoose schemas (`webhookSubscriptionSchema`, `webhookDeliverySchema`) by inspecting the schema objects directly—required paths, defaults, enums, index specs, index options, and TTL—without ever creating or saving a document. This catches regressions (dropped `required`, flipped defaults, detached TTL, accidental unique/sparse flags) that a document-level integration test, which only ever exercises valid fixtures, would miss.

## Key elements

- **`DELIVERY_RETENTION_SECONDS`** – module-level constant; reads `NODE_WEBHOOK_DELIVERY_RETENTION_DAYS` from the current environment and converts to seconds. Used to assert the TTL index value against the configured policy rather than a hardcoded literal.
- **`describe('webhookSubscriptionSchema')`** – asserts required fields (five), defaults (`enabled: true`, `consecutiveFailures: 0`, `secrets: []`), `secrets` sub-schema options (`_id: false`), ring-entry required fields, two index specs, no unique/sparse options, and `timestamps: true`.
- **`describe('webhookDeliverySchema')`** – asserts required fields (seven), absence of outcome/lease fields, defaults (`attempt: 1`, `status: 'pending'`), the `status` enum (four values, no `failed`), seven index specs, index options (TTL on `createdAt_1`, unique on `subscriptionId_1_eventId_1`), TTL direction, and `timestamps: true`.

## Relationships

- **`src/modules/webhooks/model.ts`** – source of the two schema objects under test (`webhookSubscriptionSchema`, `webhookDeliverySchema`).
- **`tests/support/schema.ts`** – provides the introspection helpers (`requiredPaths`, `defaultOf`, `enumOf`, `indexSpecs`, `indexOptionSpecs`, `optionsOf`, `subSchema`) that this file uses to read schema declarations without instantiating documents.
- **`src/infrastructure/config/store.ts`** – `currentEnvironment()` supplies `NODE_WEBHOOK_DELIVERY_RETENTION_DAYS`, which feeds the TTL assertion.

## Notes

- The TTL assertion is tied to the environment variable, not a literal, so changing `NODE_WEBHOOK_DELIVERY_RETENTION_DAYS` moves both the schema default and the test together.
- The TTL index must be **ascending** (`createdAt_1`); a descending variant on the same field (present in two compound indexes) would silently never expire documents.
- Neither subscription index is unique—the per-tenant cap is enforced in application code (`services/subscriptions.ts`), not at the database level.
- The `secrets` sub-schema sets `_id: false` because the application mints its own `id` per entry; an auto-assigned Mongoose `_id` would create a redundant identity.
- The delivery `status` enum intentionally omits `failed`; a retryable failure returns to `pending`, and only `exhausted` is terminal.
