---
source: tests/unit/scripts/scaffold/demo-remove-tests.test.ts
sha256: 5801eee4dbf856542c1d5b3fa2b7d451465c34a8266f82a99bd7685190cbcbf1
generated_at: 2026-10-15T13:31:05.181606+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/demo-remove-tests.test.ts

## Purpose

Unit tests for the `removeResidueTests` scaffolding utility. Verifies that the function correctly identifies and deletes test files that reference a removed module—via alias, relative path, `jest.mock`, dynamic `import()`, the `requires-module` comment annotation, or scenario-fixture imports—while leaving intact tests that merely mention the module name inside a string literal or import a sibling (unremoved) module.

## Key elements

- **`REMOVED`** (`'@modules/cart'`) — single constant for the removed-module alias used across all fixture strings, so no test body reads as a real import.
- **`write(relative, content)`** — helper that creates parent directories under the temp root and writes a file.
- **`beforeEach` / `afterEach`** — create a `mkdtempSync` throwaway root (plus a `src/modules/users/tests/` subtree) and `rmSync` it with `{ recursive, force }` after each test.
- **`describe('removeResidueTests')`** — seven `it` blocks covering:
  - Alias + sub-path + relative-path imports are all detected and deleted.
  - `jest.mock` and dynamic `import()` specifiers are detected.
  - A module name appearing only inside a string literal is **not** treated as an import.
  - A sibling module import (`@modules/users`) and a near-miss string (`@modules/cartoon/x`) are preserved.
  - Transitive deletion: a support file that imports the removed module causes its importing test to be deleted, while unrelated tests survive.
  - The `// requires-module: cart` comment annotation triggers deletion even without an `import` statement.
  - Scenario-fixture imports (`@scenarios/cart`) and imports from a removed module's own `tests/` folder (found inside a surviving module's test dir) are both deleted.

## Relationships

- **`scripts/scaffold/demo-remove-tests.ts`** — the module under test; this file imports and exercises its sole export `removeResidueTests`.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** — co-located unit test in the same `tests/unit/scripts/` tree; no direct code-level interaction with this file.

## Notes

- Every test runs against a **fresh temp directory** (`mkdtempSync`), so tests are fully isolated and order-independent.
- The `REMOVED` constant is intentionally a single token so that fixture strings like `` jest.mock('${REMOVED}/routes') `` are clearly synthetic and won't confuse a reader (or an linter) into treating them as real module paths.
- The "string-only" and "sibling-module" tests exist specifically to guard against over-matching in the removal heuristic; regressions here mean the scaffolder would delete tests it shouldn't.
- The transitive-deletion test (`tests/support/checkout.ts` → `uses-support.test.ts` / `relative.test.ts`) verifies that the algorithm follows imports one level beyond the directly-removed module, but still leaves `unrelated.test.ts` in place.
