---
source: tests/cross-cutting/authorization-conformance.test.ts
sha256: 2e145f628fcbc17ed6e3e8f3aaa61e0fcfdff6bea796dcda7f885af3ce85c825
generated_at: 2026-11-08T09:24:11.549387+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/authorization-conformance.test.ts

## Purpose

Runs a shared authorization conformance suite (`shared/authorization-conformance.yaml`) against this repository's CASL-based evaluator. The YAML file is committed with identical bytes in both backends (this one and the PHP twin); each side runs it against its own implementation so that the two stay behaviorally equivalent for the exact cases the file enumerates. The file deliberately includes DENY cases to catch widened scopes that a pure-allow test would miss.

## Key elements

- **`ConformanceCase`** — interface describing one row in the YAML: `name`, `caller`, `action`, `subject`, `resource` (plain attribute bag), and `expect` (`'allow'` | `'deny'`).
- **YAML load** — reads and parses `shared/authorization-conformance.yaml` once at module scope; destructures `cases`.
- **Floor constants (`MIN_CASES`, `MIN_DENY`, `MIN_ALLOW`)** — minimum case counts the file must satisfy. Values differ depending on whether the `orders` module is deployed (30/20/10 vs 20/12/6).
- **`'reads enough cases to be worth running'`** — asserts the floors so a silently empty or truncated YAML file fails loudly rather than producing a vacuous pass.
- **`it.each` conformance loop** — for every case, builds an ability via `buildAbility(caller)` and calls `.can(action, subject(type, resource))`, asserting the allow/deny outcome matches the YAML expectation.

## Relationships

- **`src/kernel/ability.ts`** — imports `buildAbility`, the function that constructs a CASL `Ability` from a `Caller` object for each test case.
- **`src/types/index.ts`** — barrel import (`@types`) from which the `Caller` type is pulled; the test's `caller` field is typed against it.
- **`src/types/auth-context.ts`** — likely the defining module behind the `Caller` type re-exported through `src/types/index.ts`.
- **`tests/support/paths.ts`** — provides `isDeployed('orders')`, used to select the appropriate floor thresholds when the orders module has been removed from the deployment.

## Notes

- The `subject()` import is from `@casl/ability`, **not** the test-case `subject` string field. CASL's `subject(type, attrs)` names the type of a plain object; the resource arrives as a YAML attribute bag with no backing class.
- Floor thresholds are split into allow and deny separately because an evaluator that denies everything would satisfy every deny case yet violate the allow floor.
- The YAML file is **not** copied between backends at build or test time; it is committed independently with identical bytes, the same arrangement used for Spectral rulesets.
- The `it.each` title is `%s: %s` (expect + name) so a single failure in a large suite is identifiable by the expected outcome and case name without reading the assertion.
