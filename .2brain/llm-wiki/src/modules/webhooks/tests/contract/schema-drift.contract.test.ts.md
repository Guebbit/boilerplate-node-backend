---
source: src/modules/webhooks/tests/contract/schema-drift.contract.test.ts
sha256: c8712f339e917b4a1f2b119f92fc3da6802bd07a70727077fdea9980e02d0c19
generated_at: 2026-11-08T09:07:40.672711+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/contract/schema-drift.contract.test.ts

## Purpose

Guards against silent drift between the `WebhookSubscription` and `WebhookSubscriptionCreated` schemas in the module's `openapi.yaml`. Because JSON Schema (and the orval-generated Zod judge) cannot compose two `additionalProperties: false` siblings via `allOf`, the field list is restated by hand in the second schema; this test is the sole sync mechanism between the two declarations.

## Key elements

- **`CREATED_ONLY_FIELDS`** — `Set<string>` of fields (`'secret'`, `'newSecret'`) that `WebhookSubscriptionCreated` legitimately adds on top of `WebhookSubscription`; used to whitelist expected extras.
- **`spec`** (module-level) — the result of parsing `../../openapi.yaml` with the `yaml` package; cast to expose `components.schemas`.
- **`subscription` / `created`** — shorthand references to the two `ObjectSchema` entries extracted from `spec`.
- **`describe('WebhookSubscriptionCreated mirrors WebhookSubscription', …)`** — three assertions:
  1. Every property of `WebhookSubscription` exists in `WebhookSubscriptionCreated`.
  2. `WebhookSubscriptionCreated` has no property outside `WebhookSubscription` ∪ `CREATED_ONLY_FIELDS`.
  3. The `required` arrays are identical (compared as `Set`s).

## Relationships

- Reads **`src/modules/webhooks/openapi.yaml`** (resolved relative to `__dirname/../../openapi.yaml`) at module load; this is the *module-local* spec, not a generated root bundle.
- Comment references **`tests/support/response-contract.ts`** (orval-generated Zod schemas) as the "judge" that ultimately consumes the spec and motivates the flat-restatement approach.

## Notes

- The file intentionally does **not** import any generated code; it parses raw YAML so it catches drift at the source.
- `unevaluatedProperties` would allow a closed `allOf` composition, but the orval/Zod pipeline used by this repo's contract tests cannot express it—hence the manual duplication this test polices.
- Adding a new field to *either* schema without updating the other will fail the suite; the only intentional divergence is the `secret` / `newSecret` pair in `CREATED_ONLY_FIELDS`.
