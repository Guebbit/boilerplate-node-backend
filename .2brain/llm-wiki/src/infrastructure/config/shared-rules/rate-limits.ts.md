---
source: src/infrastructure/config/shared-rules/rate-limits.ts
source_sha256: 15b0e2847bb9b3747f54102ef44ea8cc8dbc4b85e2fa46e88f45f215414d982a
context_sha256: ea62945641857c5b6f346982c411352892afad3918fb0f64e6bca1919c29e240
generated_at: 2026-11-22T02:46:17.343069+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/shared-rules/rate-limits.ts

## Purpose
Defines the Zod schema for the *data* of rate-limit budgets, as written in `shared/rules/rate-limits.yaml` (the kernel's budgets) and in each module's `module.yaml` `rateLimits:` block. It covers only the fields a twin backend must copy. How a caller is bucketed (`keyGenerator`), what counts as a success, and what is skipped stay in code. `RateLimitBudget` (`@types`) is this data plus that code.

## Key elements
- `rateLimitBudgetDataSchema` (not exported): a strict object for one budget. Its fields are:
  - `name`: a non-empty short row label for a generated table.
  - `namespace`: a Redis/memory key prefix, lowercase kebab-case (`/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`).
  - `environmentVariable`: the env var that overrides `defaultMax`. It must match `NODE_[A-Z0-9_]+`.
  - `defaultMax`: a positive integer, used when the env var is unset.
  - `windowMs`: either the literal `'shared'` (meaning `NODE_RATE_LIMIT_WINDOW_MS`) or a positive integer number of milliseconds.
  - `bounds`: a non-empty one-line description of what the budget bounds and why.
  - `audited`: a boolean for whether a refusal emits an audit event.
  - `onStoreError`: optional, `'memory'` or `'pass'`. This is the behaviour while the limits Redis is down, and absent means `memory`.
- `camelCaseOf` (not exported): converts a kebab-case namespace to camelCase, e.g. `credentials-identity` becomes `credentialsIdentity`.
- `rateLimitsBlockSchema` (exported): a record of budgets. A refinement requires each key to equal `camelCaseOf(budget.namespace)`, with the message "a budget is keyed by its namespace in camelCase".
- `rateLimitsSchema` (exported): a strict object `{ rateLimits: rateLimitsBlockSchema }`, the shape of `shared/rules/rate-limits.yaml`.

## Relationships
- `registry.ts` sits alongside this file in `shared-rules/`.
- `scripts/contracts/generate-shared-rule-schemas.ts` and `scripts/docs/module-descriptor.ts` are graph neighbors of this schema. The file content does not show how they use it.
- `tests/unit/infrastructure/config/rate-limits-schema.test.ts` is the unit test for these schemas.

## Notes
- The schema is strict: an unknown key is treated as a typo, or as behaviour that belongs in code.
- The file may use relative imports only (see `load.ts` in the same directory).
- The camelCase key rule ties the YAML key to the `namespace` value, so the two cannot drift apart.
