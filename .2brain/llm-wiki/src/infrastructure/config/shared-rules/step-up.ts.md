---
source: src/infrastructure/config/shared-rules/step-up.ts
sha256: bd724a597299fe180ae59deaf260bddfb3029a086fc26e34f7beb6a5247fbb36
generated_at: 2026-11-08T03:27:56.760380+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/step-up.ts

## Purpose

Defines Zod schemas that validate the `stepUp:` block inside `shared/authorization-keys.yaml`. The block specifies how recent a sign-in must be (in seconds) for two security tiers (`critical` and `sensitive`). The schemas use a loose wrapper so the rest of the YAML document (owned by `kernel/permissions.ts`) can carry other keys without causing validation failures.

## Key elements

- **`seconds`** (internal) — `z.int().positive()`, the shared type for all window values.
- **`stepUpWindowsSchema`** (exported) — A `z.strictObject` with exactly two keys: `critical` (money/destructive actions) and `sensitive` (identity/sessions). Both must be positive integers representing seconds. Strict means no extra keys are permitted.
- **`stepUpDocumentSchema`** (exported) — A `z.looseObject` wrapping a single `stepUp` field set to `stepUpWindowsSchema`. Loose so sibling top-level keys in the YAML document don't cause rejection.

## Relationships

- **`scripts/contracts/generate-shared-rule-schemas.ts`** — Consumes these schemas to emit contract/schema artifacts (e.g., JSON Schema or type stubs) for the shared-rule block.
- **`tests/unit/infrastructure/config/ops-rules-schemas.test.ts`** — Unit-tests the schemas defined here (shape, strictness, positive-integer constraints).

## Notes

- The module header mandates **relative imports only**; see `src/infrastructure/config/shared-rules/load.ts` for the convention's rationale.
- `stepUpWindowsSchema` is **strict** (exactly `critical` + `sensitive`), while `stepUpDocumentSchema` is **loose**. Do not swap them: the strict inner schema is what enforces the two-tier contract, and the loose outer schema is what lets the broader YAML file coexist with other keys.
- Values are whole seconds, not milliseconds or floating-point.
