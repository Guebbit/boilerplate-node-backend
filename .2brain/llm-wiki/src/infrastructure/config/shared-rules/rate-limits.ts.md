---
source: src/infrastructure/config/shared-rules/rate-limits.ts
sha256: 36f498ef55aad35fb3f564fcff7c8c62aa1e5dc4e9327b62415319d888213f96
generated_at: 2026-11-14T17:58:44.533835+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/rate-limits.ts

## Purpose

Defines Zod schemas that validate the **data** portion of a rate-limit budget as it appears in YAML config files (`shared/rules/rate-limits.yaml` and per-module `module.yaml` `rateLimits:` blocks). It captures only the fields a twin backend must copy (bucketing key, limits, window, audit flag); behavioral logic such as `keyGenerator` and success/skip semantics stays in code and lives on the separate `RateLimitBudget` type (`@types`).

## Key elements

- **`rateLimitBudgetDataSchema`** (internal) – `z.strictObject` with fields: `name`, `namespace` (kebab-case), `environmentVariable` (`NODE_*` pattern), `defaultMax` (positive int), `windowMs` (positive int or the literal `'shared'`), `bounds`, `audited`, and optional `onStoreError` (`'memory' | 'pass'`).
- **`camelCaseOf`** (internal helper) – converts a kebab-case namespace to its camelCase form (e.g. `credentials-identity` → `credentialsIdentity`).
- **`rateLimitsBlockSchema`** (exported) – `z.record` of budgets keyed by their namespace in camelCase; a `.refine` asserts every key equals `camelCaseOf(budget.namespace)`.
- **`rateLimitsSchema`** (exported) – top-level strict object `{ rateLimits: rateLimitsBlockSchema }`, matching the shape of `shared/rules/rate-limits.yaml`.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** – consumes the exported schemas to validate and parse the YAML at runtime.
- **`scripts/contracts/generate-shared-rule-schemas.ts`** – imports these schemas to generate contract/schema artifacts.
- **`scripts/docs/module-descriptor.ts`** – imports the schema to extract field metadata (e.g. `name`, `bounds`) for documentation generation.
- **`tests/unit/infrastructure/config/rate-limits-schema.test.ts`** – unit-tests the validation rules (key/refinement, strictness, field constraints).

## Notes

- Strict objects are used throughout: any unexpected key in the YAML is rejected as a typo or a behavior that belongs in code.
- `windowMs` may be the string `'shared'`, which defers to the `NODE_RATE_LIMIT_WINDOW_MS` environment variable rather than a per-budget literal.
- `onStoreError` is optional; when absent the effective default is `'memory'`.
- The module enforces **relative imports only** (see `load.ts` in the same directory for the convention).
