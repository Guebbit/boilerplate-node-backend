---
source: tests/cross-cutting/permission-vocabulary.test.ts
sha256: 9b5bbaf1807312adb5ffeffc14f046451b1a98fe07a0a8338cea27b8644bdca1
generated_at: 2026-11-14T23:05:53.890882+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/permission-vocabulary.test.ts

## Purpose

Cross-cutting integration test that locks the entire permission-vocabulary chain in place: the shared YAML is the single source of truth, the generated API constants must match it exactly, and the kernel's runtime rule/set/tier tables must be a faithful projection of those constants. It also confirms that undeclared permission pairs are rejected at both compile time (TypeScript) and run time.

## Key elements

- **`yaml` (top-level const)** — Reads and parses `shared/authorization-keys.generated.yaml` via `readFileSync` + `yaml/parse`; typed as an object with `actions`, `scopes`, `stepUp`, `rules`, and `sets`.
- **`describe('permission vocabulary')`** — Contains four `it` blocks:
  1. *lists exactly what the shared yaml declares* — Asserts each generated constant (`PERMISSION_ACTIONS`, `AUTHORIZATION_SCOPES`, `STEP_UP_TIERS`, `PERMISSION_SET_NAMES`, `PERMISSION_RULE_IDS`, `PERMISSION_SUBJECTS`) equals the corresponding YAML slice.
  2. *carries every rule, set and tier the kernel loaded* — Verifies `PERMISSION_RULES` / `PERMISSION_SETS` IDs match the vocabulary constants and that no rule references an unknown step-up tier.
  3. *maps each subject to the actions of the rules declared on it* — Confirms `PERMISSION_PAIRS` contains every rule's action under its subject and that its keys equal `PERMISSION_SUBJECTS`.
  4. *refuses an undeclared pair at compile time, and still answers false at run time* — Uses `@ts-expect-error` on `holds()` and `requirePermission()` with fabricated action/subject to prove type-level rejection, then asserts the runtime results (`false` / thrown error).

## Relationships

- **`src/kernel/ability.ts`** — Imports `holds`; the test calls it with a deliberately invalid action/subject pair to verify the runtime returns `false` rather than throwing.
- **`src/kernel/middlewares/authorizations.ts`** — Imports `requirePermission`; the test calls it with an undeclared subject to confirm it throws a "declare" error.
- **`src/kernel/permissions.ts`** — Imports `PERMISSION_RULES`, `PERMISSION_SETS`, and `anonymousCaller`; these are the kernel-side data structures whose IDs, actions, and step-up tiers are cross-checked against the vocabulary constants.
- **`tests/support/paths.ts`** — Imports `REPO_ROOT` to construct the absolute path to the YAML file relative to the repository root.

## Notes

- The test reads the YAML file directly from disk (`node:fs` + `yaml` package) rather than importing it, so it validates the *generated* TS constants against the *source* YAML in the same run.
- `PERMISSION_RULE_IDS` is expected to use the `"action:subject"` string format — the test constructs that shape from the YAML `rules` array.
- The compile-time assertions rely on `@ts-expect-error` comments; if the type system ever starts accepting those pairs, the test will fail at type-check rather than at runtime.
- `anonymousCaller` from `@kernel/permissions` is used solely to produce a valid `Ability` argument for `holds`; the subject/action arguments are the ones under test.
