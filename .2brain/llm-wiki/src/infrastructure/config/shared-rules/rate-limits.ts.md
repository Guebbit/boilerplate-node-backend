---
source: src/infrastructure/config/shared-rules/rate-limits.ts
sha256: f901a5cc3b8aed74552fc311dad3bba801a1c50e2d1adb98910909bfd40ab5a5
generated_at: 2026-11-08T03:27:32.630051+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/rate-limits.ts

## Purpose

Defines the Zod schemas that validate the **data** portion of rate-limit budgets as they appear in `shared/rules/rate-limits.yaml` (kernel budgets) and in each module's `module.yaml` under `rateLimits:`. It captures only the serializable configuration (keying, limits, window, audit flag, degradation policy); behavioural code such as `keyGenerator` lives outside this schema and is added later by `RateLimitBudget` in `@types`.

## Key elements

- **`rateLimitBudgetDataSchema`** — A `z.strictObject` describing a single budget entry. Fields: `name`, `namespace` (kebab-case), `environmentVariable` (must match `NODE_…`), `defaultMax`, `windowMs` (positive int or the literal `'shared'`), `bounds`, `audited`, and optional `onStoreError` (`'memory'` | `'pass'`).
- **`rateLimitsBlockSchema`** — A `z.record` of budgets keyed by string, refined so every key equals the camelCase of its value's `namespace`. Enforces the "key = camelCased namespace" invariant at parse time.
- **`rateLimitsSchema`** — Top-level wrapper: `{ rateLimits: rateLimitsBlockSchema }`, matching the shape of `rate-limits.yaml`.
- **`camelCaseOf`** (private helper) — Converts a kebab-case namespace to camelCase; used only inside the block-level refinement.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — Imports these schemas to register/validate rate-limit rules at load time.
- **`scripts/contracts/generate-shared-rule-schemas.ts`** — Consumes the Zod schemas to emit JSON-Schema / contract artifacts for downstream tooling.
- **`scripts/docs/module-descriptor.ts`** — Reads the schema shape (via the registry) to render the budget table in `docs/tools/security.md`.
- **`tests/unit/infrastructure/config/rate-limits-schema.test.ts`** — Unit-tests all three exported schemas, including the namespace-key refinement and strict-object rejection of unknown fields.

## Notes

- `z.strictObject` is used intentionally: any key not listed here is treated as a typo or as a field that should live in code, not in YAML.
- `windowMs` accepting the string `'shared'` means the actual window is resolved at runtime from `NODE_RATE_LIMIT_WINDOW_MS`; the schema does not encode a numeric default for that case.
- `onStoreError` is optional; when absent the runtime default is `'memory'` (degrade to in-memory counting) rather than `'pass'` (fail open).
- The block-level refinement makes the object key semantically redundant with `namespace`—this is a deliberate self-documenting constraint, not a mistake.
- Relative imports only (see `load.ts` in the same directory); this file has no cross-boundary imports beyond `zod`.
