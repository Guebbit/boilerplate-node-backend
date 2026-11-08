---
source: tests/cross-cutting/permission-vocabulary.test.ts
sha256: ca535c039efec53be00eb2d1de92886527b30bdc5a096d272355a376c858c321
generated_at: 2026-11-08T09:29:44.556370+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/permission-vocabulary.test.ts

## Purpose

Cross-cutting integration test that pins the permission-vocabulary chain end-to-end: the single YAML source (`shared/authorization-keys.yaml`), the generated `@api/permission-vocabulary` exports, and the kernel's loaded rules, sets, and tiers must all agree. It also verifies that undeclared action/subject pairs are rejected both at compile time (type-level) and at run time.

## Key elements

- **YAML parse (module scope):** Reads and parses `shared/authorization-keys.yaml` once, casting to an inline shape (`actions`, `scopes`, `stepUp`, `rules`, `sets`). This is the ground truth every assertion compares against.
- **`it('lists exactly what the shared yaml declares')`** — Asserts that `PERMISSION_ACTIONS`, `AUTHORIZATION_SCOPES`, `STEP_UP_TIERS`, `PERMISSION_SET_NAMES`, `PERMISSION_RULE_IDS`, and `PERMISSION_SUBJECTS` (all from `@api/permission-vocabulary`) match the YAML contents exactly, including rule-ID format (`action:subject`).
- **`it('carries every rule, set and tier the kernel loaded')`** — Cross-checks that `PERMISSION_RULES` / `PERMISSION_SETS` from `@kernel/permissions` reference only IDs present in the generated vocabulary, and that each rule's `action` and `stepUp` (if set) are declared in the YAML.
- **`it('maps each subject to the actions of the rules declared on it')`** — Verifies `PERMISSION_PAIRS` (a Map from subject → actions) is complete and consistent with the YAML rule set.
- **`it('refuses an undeclared pair at compile time, and still answers false at run time')`** — Uses `@ts-expect-error` to confirm the type system rejects `holds(…, 'checkout', 'Order')` and `requirePermission('read', 'Ordr')`; then asserts the runtime behaviours (returns `false` / throws with `/declare/i`).

## Relationships

- **`src/kernel/permissions.ts`** — Source of `PERMISSION_RULES`, `PERMISSION_SETS`, and `anonymousCaller`; the test verifies these loaded structures stay in lockstep with the generated vocabulary.
- **`src/kernel/ability.ts`** — Source of `holds()`; exercised with a deliberately invalid pair to confirm run-time denial.
- **`src/kernel/middlewares/authorizations.ts`** — Source of `requirePermission`; exercised with an undeclared subject to confirm the middleware throws a declarative error.
- **`tests/support/paths.ts`** — Provides `REPO_ROOT` so the test can locate `shared/authorization-keys.yaml` regardless of CWD.

## Notes

- The YAML is read **directly** (not via the generated module), making this a true cross-cutting check that the code-generation step has not drifted from the source.
- `PERMISSION_PAIRS` is a `Map<string, string[]>`; the test iterates its values with `.toContain` and its keys with spread.
- Rule IDs are composite strings (`${action}:${subject}`); any change to that format must be reflected in both the generator and this assertion.
- The `@ts-expect-error` lines are load-bearing: if the type system starts accepting those pairs, the test file will fail to compile, alerting you immediately.
