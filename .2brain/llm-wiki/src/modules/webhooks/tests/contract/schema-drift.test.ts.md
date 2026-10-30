---
source: src/modules/webhooks/tests/contract/schema-drift.test.ts
sha256: c8712f339e917b4a1f2b119f92fc3da6802bd07a70727077fdea9980e02d0c19
generated_at: 2026-10-29T06:31:15.647550+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/contract/schema-drift.test.ts

## Purpose

Contract test that guards against drift between the `WebhookSubscription` and `WebhookSubscriptionCreated` schemas in the module's `openapi.yaml`. Because both schemas must be kept flat (closed under `additionalProperties: false`) for ajv compatibility, their property lists are duplicated by hand with no other synchronization mechanism. This test is that mechanism.

## Key elements

- **`CREATED_ONLY_FIELDS`** — A `Set` of two field names (`secret`, `newSecret`) that `WebhookSubscriptionCreated` legitimately adds on top of `WebhookSubscription`. Used to whitelist extra properties.
- **`ObjectSchema`** — Minimal structural type (`properties` + optional `required`) used to cast the parsed YAML so TypeScript can navigate the schema tree.
- **Module-level spec load** — Reads and parses `../../openapi.yaml` once at import time via `node:fs` + `yaml`. No project code is imported; the test is self-contained.
- **`describe('WebhookSubscriptionCreated mirrors WebhookSubscription')`** — Three assertions:
  1. Every property on `WebhookSubscription` also appears on `WebhookSubscriptionCreated`.
  2. `WebhookSubscriptionCreated` has no properties beyond `WebhookSubscription`'s plus `CREATED_ONLY_FIELDS`.
  3. The `required` arrays of both schemas are set-equal.

## Relationships

- **`src/modules/webhooks/openapi.yaml`** (resolved as `../../openapi.yaml`) — Read at import time; the sole data source. The test deliberately targets the module-local spec file, not any generated root bundle.
- **`tests/support/response-contract.ts`** — Referenced in the module doc comment as the *reason* the composition trick (`allOf` / `unevaluatedProperties`) is not viable (orval-generated Zod cannot compose two closed siblings). Not imported here.

## Notes

- The test parses raw YAML rather than importing a TS schema object. If the schema shape in `openapi.yaml` changes structurally (e.g., a nested object gains its own `properties`), the `ObjectSchema` cast may mask a type error at parse time — the test would still pass on a superficially matching top-level key set.
- `CREATED_ONLY_FIELDS` is a manual whitelist. Adding a new secret-reveal field to the OpenAPI schema without updating this set will fail assertion 2, even if the field is intentional.
- The `required` comparison uses `Set` equality, so ordering of the `required` array in YAML is irrelevant.
- The test does **not** validate property types, defaults, or descriptions — only key presence and required-ness.
