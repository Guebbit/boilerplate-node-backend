---
source: tests/unit/scripts/scaffold/demo-remove-tests.test.ts
sha256: 5801eee4dbf856542c1d5b3fa2b7d451465c34a8266f82a99bd7685190cbcbf1
generated_at: 2026-11-08T10:41:37.187645+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/demo-remove-tests.test.ts

## Purpose
Unit tests for the `removeResidueTests` scaffolding script. Verifies that, after a module is removed, every test file that references it (via alias import, relative import, `jest.mock`, dynamic `import`, or a `requires-module` comment) is deleted, while files that merely mention the name inside a string or import a *different* module are preserved.

## Key elements
- **`REMOVED`** – constant holding the alias string `'@modules/cart'`; used in fixtures so the removed specifier is spelled once and doesn't look like a live import to tooling.
- **`root`** – per-test temp directory (created in `beforeEach`, removed in `afterEach`) that simulates a repo with `src/modules/` and `tests/` trees.
- **`write(relative, content)`** – helper that creates parent dirs and writes a file under `root`.
- **`describe('removeResidueTests')`** – eight test cases covering:
  - Deletion by alias, sub-path, and relative-path imports.
  - Detection of `jest.mock` and `await import` specifiers.
  - Preservation of string-quoted import text (lint-fixture scenario).
  - Preservation when the removed name appears only inside a string or a sibling module import.
  - Cascade: a test importing a *support* file that itself imports the removed module is also deleted; an unrelated test is kept.
  - Deletion via a `// requires-module: cart, orders` comment directive (no actual import needed).
  - Deletion when importing scenario fixtures (`@scenarios/cart`).
  - Sweeping the `tests/` subfolder of a *surviving* module (`src/modules/users/tests/`).

## Relationships
- **`scripts/scaffold/demo-remove-tests.ts`** – the function under test (`removeResidueTests`) is imported and called in every test case. This file exercises its deletion logic against a real filesystem tree.

## Notes
- Tests operate on a **real temporary directory** (`mkdtempSync`), not an in-memory FS; `existsSync` is used to assert post-deletion state.
- The cascade test relies on `removeResidueTests` resolving *non-test* support files (`tests/support/checkout.ts`) that import the removed module and then transitively deleting tests that import those support files.
- The `requires-module` comment is a project convention for declaring a hard dependency without a static `import`; the test confirms the function honours it.
- The sibling-module test guards against false positives: `'@modules/cartoon/x'` must **not** match the removed `cart` alias.
