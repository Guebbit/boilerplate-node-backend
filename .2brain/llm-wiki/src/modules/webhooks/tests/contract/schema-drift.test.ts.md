---
source: src/modules/webhooks/tests/contract/schema-drift.test.ts
sha256: f3ba5a3f27d61a84ce89cc293a6054de571f7d01d097d92005bbcccd328447b2
generated_at: 2026-09-23T19:43:28.660630+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/contract/schema-drift.test.ts

## Purpose

Guards against schema drift between `WebhookSubscription` and `WebhookSubscriptionCreated` in the module's local `openapi.yaml`. Because the two schemas must be written as flat, closed (`additionalProperties: false`) objects—rather than composed with `allOf`—their property lists are duplicated by hand with nothing else enforcing consistency. This test is that enforcement: it fails the moment a field is added, removed, or renamed in one schema but not the other.

## Key elements

- **`CREATED_ONLY_FIELDS`** – A `Set` of the two fields (`secret`, `newSecret`) that `WebhookSubscriptionCreated` legitimately adds beyond `WebhookSubscription`. Used to whitelist those extras in the "no unexpected properties" check.
- **`spec`** – Loaded at module scope via `readFileSync` + `yaml.parse` from `../../openapi.yaml` (the module-local fragment, not a generated root bundle). Typed as `{ components: { schemas: Record<string, ObjectSchema> } }`.
- **`describe('WebhookSubscriptionCreated mirrors WebhookSubscription')`** – Contains three tests:
  - *carries every WebhookSubscription property* – every key in `subscription.properties` must exist in `created.properties`.
  - *adds no property beyond the known secret-reveal fields* – every key in `created.properties` must either be in `subscription.properties` or in `CREATED_ONLY_FIELDS`.
  - *requires the same fields as WebhookSubscription* – the `required` arrays (compared as `Set`s) must be identical.

## Relationships

No graph neighbors. The file's only I/O is a direct read of `../../openapi.yaml` at runtime; it imports nothing from other source modules.

## Notes

- The spec is read from the **module-local** `openapi.yaml` (resolved relative to `__dirname`), not from a generated/aggregated root bundle. If the module's spec is moved, the path must be updated.
- The test runs on **plain Ajv in draft-07 mode** (via `openapi-response-validator`), which does not support `unevaluatedProperties` or 2019-09/2020-12 dialects. This is the root cause for the flat restatement in the YAML and for this test existing at all.
- Adding a new field to `WebhookSubscription` requires a **manual** mirror edit in `WebhookSubscriptionCreated` before this test passes—there is no auto-sync mechanism.
