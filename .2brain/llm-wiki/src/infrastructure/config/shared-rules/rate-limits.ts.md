---
source: src/infrastructure/config/shared-rules/rate-limits.ts
sha256: f901a5cc3b8aed74552fc311dad3bba801a1c50e2d1adb98910909bfd40ab5a5
generated_at: 2026-10-29T02:00:15.831661+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/rate-limits.ts

## Purpose

Defines the Zod validation schemas for rate-limit budget *data* as it appears in `shared/rules/rate-limits.yaml` (kernel budgets) and in each module's `module.yaml` `rateLimits:` block. It captures only the declarative fields a twin backend must copy verbatim (bucketing key, limits, window, audit flag, fallback); runtime logic such as `keyGenerator` lives in the `RateLimitBudget` type in `@types`, not here.

## Key elements

- **`rateLimitBudgetDataSchema`** – A `z.strictObject` describing one budget entry. Fields: `name`, `namespace` (kebab-case), `environmentVariable` (`NODE_*`), `defaultMax`, `windowMs` (positive int or literal `'shared'`), `bounds`, `audited`, and optional `onStoreError` (`'memory'` | `'pass'`).
- **`rateLimitsBlockSchema`** – A `z.record` of budgets keyed by the camelCase form of each budget's `namespace`. A `.refine` enforces that every record key equals `camelCaseOf(budget.namespace)`.
- **`rateLimitsSchema`** – Top-level shape of `shared/rules/rate-limits.yaml`: `{ rateLimits: rateLimitsBlockSchema }`.
- **`camelCaseOf`** *(internal)* – Converts a kebab-case namespace string to camelCase (e.g. `credentials-identity` → `credentialsIdentity`). Used by the record-key refinement.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** – Consumes these schemas at load time to validate and register rate-limit budgets from YAML before they become runtime `RateLimitBudget` objects.
- **`scripts/contracts/generate-shared-rule-schemas.ts`** – Imports the exported schemas to generate JSON-Schema artifacts or contract files for external tooling.
- **`scripts/docs/module-descriptor.ts`** – References the schema shape when documenting or validating the `rateLimits:` section of a module descriptor.
- **`tests/unit/infrastructure/config/rate-limits-schema.test.ts`** – Unit-tests the three exported schemas (valid/invalid payloads, strictness, key-casing refinement).

## Notes

- **Strict objects throughout.** Any key not listed is rejected at parse time—this is deliberate to surface typos or fields that belong in code rather than YAML.
- **Record keys ≠ `namespace` field.** The YAML record key must be the *camelCase* of the `namespace` value (kebab-case). The `.refine` on `rateLimitsBlockSchema` enforces this; forgetting to camelCase the key is the most common authoring mistake.
- **`windowMs: 'shared'`** is a sentinel, not a number—it defers to the `NODE_RATE_LIMIT_WINDOW_MS` environment variable at runtime.
- **`onStoreError` is optional** and defaults to `'memory'` (in-process fallback) when the Redis limit store is unavailable; `'pass'` means admit all requests during the outage.
- The module doc comment mandates **relative imports only** for anything under this directory (see `load.ts` for the rationale); this file itself imports only `zod`.
