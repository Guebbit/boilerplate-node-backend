---
source: tests/cross-cutting/authorization-conformance.test.ts
sha256: 2e145f628fcbc17ed6e3e8f3aaa61e0fcfdff6bea796dcda7f885af3ce85c825
generated_at: 2026-10-15T12:35:43.302772+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/authorization-conformance.test.ts

## Purpose

Runs a shared set of authorization allow/deny cases (defined in `shared/authorization-conformance.yaml`) against this repository's CASL-based evaluator, verifying that the TypeScript twin and its PHP/Laravel twin agree on the same policy decisions. The file is committed identically in both backends and nothing syncs it; each side simply points at the same committed bytes. It also enforces "floor" minimums so a silently empty or truncated YAML file cannot produce a vacuously green suite.

## Key elements

- **`ConformanceCase`** — interface describing one YAML case: `name`, `caller`, `action`, `subject`, `resource`, and `expect` (`'allow' | 'deny'`).
- **`cases`** — the parsed array of `ConformanceCase` objects, read once at module load from the shared YAML file via `readFileSync` + `yaml.parse`.
- **`shopDeployed`** — boolean from `isDeployed('orders')` that determines whether the full shop cases are present in the YAML.
- **`MIN_CASES` / `MIN_DENY` / `MIN_ALLOW`** — conditional floor constants (30/20/10 with shop, 20/12/6 without) guarding against a file that lost most of its cases.
- **`describe('the shared conformance suite', …)`** — two `it` blocks:
  1. Asserts the parsed case counts meet the floors.
  2. `it.each` over every case: builds a CASL ability via `buildAbility(one.caller)`, evaluates `can(action, subject(type, resource))`, and asserts the allow/deny outcome matches the YAML expectation.

## Relationships

- **`src/kernel/ability.ts`** — provides `buildAbility(caller)`, the single entry point that constructs a CASL `Ability` for a given `Caller`. This test is its primary integration-level consumer.
- **`src/types/auth-context.ts`** — source of the `Caller` type imported via `@types`, which shapes the `caller` field in each YAML case and the parameter to `buildAbility`.
- **`src/types/index.ts`** — barrel re-export through which `Caller` is actually imported (`import type { Caller } from '@types'`).
- **`tests/support/paths.ts`** — provides `isDeployed('orders')`, which lets the test adjust its floor minimums when the orders/shop modules are stripped from the deployment, so the guard stays meaningful in both full and reduced configs.

## Notes

- The YAML file lives **outside** the test directory at `shared/authorization-conformance.yaml` (two levels up from `tests/cross-cutting/`). Do not move it without updating the `path.join(__dirname, '..', '..', 'shared', …)` reference.
- The floors are split into allow and deny separately on purpose: an evaluator that denies everything would pass every deny case and still look green if only a total count were checked.
- `subject()` from `@casl/ability` is used with a plain object spread (`{ ...one.resource }`) because the YAML defines attribute-level rows, not class instances. This mirrors the shape a real rule or query filter would match against.
- The file is intentionally byte-identical to its PHP twin's YAML; edits must be made in one place and committed to both repos (or a shared package). There is no automated copy step.
