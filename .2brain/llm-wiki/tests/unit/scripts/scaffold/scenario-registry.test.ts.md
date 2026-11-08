---
source: tests/unit/scripts/scaffold/scenario-registry.test.ts
sha256: 82f60429e011ca8c3261c6660b470ede207c28af5d043ea5b84041688f1a526d
generated_at: 2026-11-08T10:42:39.464054+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/scenario-registry.test.ts

## Purpose

Unit tests for the scenario-registry code generator. Verifies that the four registry files (fixtures, scenarios, doubles, levers) are rendered with correct imports and entries from the scenario files present on disk, that missing exports cause a hard failure, and that the stale/write lifecycle is idempotent.

## Key elements

- **`identity`** – No-op formatter stub passed in place of Prettier (which cannot load under Jest).
- **`write(relative, content?)`** – Helper that creates a file (and parent dirs) under the per-test temp root.
- **`rendered(file)`** – Calls `renderScenarioRegistries`, then returns the content of one specific registry file by name.
- **`beforeEach` / `afterEach`** – Create and destroy a throwaway `os.tmpdir()` directory seeded with sample scenario, double, and lever files.
- **`describe('scenario registries')`** – Six tests covering:
  - Fixture collection by `shopModule` export (ignores non-matching files).
  - Scenario collection by `<name>.scenario.ts` convention.
  - Rejection when a `.scenario.ts` file lacks a `scenario` export.
  - Doubles registry picks up `registerDouble` from `register.ts`.
  - Levers registry picks up `installLever` from `levers.ts`.
  - Deletion of source files removes entries on next render (no manual editing needed).
  - `staleScenarioRegistries` → `writeScenarioRegistries` → stale-again cycle, confirming idempotency.

## Relationships

- **`scripts/scaffold/scenario-registry.ts`** – The module under test. This file imports all of its public exports (`FIXTURE_REGISTRY`, `SCENARIO_REGISTRY`, `DOUBLES_REGISTRY`, `LEVERS_REGISTRY`, `renderScenarioRegistries`, `staleScenarioRegistries`, `writeScenarioRegistries`) and exercises each.

## Notes

- Prettier is deliberately replaced with `identity` because it cannot be loaded inside the Jest environment; any test that inspects generated content will see unformatted output.
- The temp root is created with `mkdtempSync` per test, so parallel workers never share state.
- The "drops an entry" test asserts the *exact* empty-object form (`{  }`) to catch trailing-comma or whitespace regressions in the generator.
- `staleScenarioRegistries` is expected to list **all four** registries before the first write and **none** after — this encodes the contract that staleness is binary per registry, not partial.
