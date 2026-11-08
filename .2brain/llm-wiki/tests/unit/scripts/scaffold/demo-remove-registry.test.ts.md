---
source: tests/unit/scripts/scaffold/demo-remove-registry.test.ts
sha256: 214a606a8e804f977353786f99ab7b871c996e640131c8a3dbc2952e4f69119f
generated_at: 2026-11-08T10:41:02.613619+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/demo-remove-registry.test.ts

## Purpose
Unit tests for `stripModuleRegistry`, verifying that it surgically removes every trace of a target module from `src/modules.ts` (import line, array entry, union-type member) while leaving other modules intact. The hyphenated-module case is the primary focus because the kebab-case folder name and the camelCase identifier appear as different strings in the file.

## Key elements
- **`SAMPLE`** – A multi-line string constant that mirrors the shape the scaffolder writes: three modules (`orders`, `stock-alerts`, `users`) each referenced in an import, the `enabledModules` array, and the `ModuleName` union type.
- **`beforeEach` / `afterEach`** – Create a fresh temp directory (`mkdtempSync`) containing `src/modules.ts` populated with `SAMPLE`; tear it down with `rmSync` after each test.
- **`describe('stripModuleRegistry')`** – Two tests:
  - Hyphenated module: asserts no `stockAlerts` or `stock-alerts` token remains and that the other two modules are untouched.
  - Identical-name module (`orders`): asserts the single-token removal also works when folder name and identifier are the same word.

## Relationships
- **Imports** `stripModuleRegistry` from `scripts/scaffold/demo-remove-registry.ts` — the sole production dependency under test. All assertions are made against the file that function rewrites on disk.

## Notes
- The tests are filesystem-level (read the rewritten file back), not mock-based, so they catch any path or encoding mismatch in the real implementation.
- The hyphenated case is the one that "matters" per the module doc-comment: a naive single-string search for the folder name would miss the camelCase identifier and leave a dangling reference.
- Temp directories use a `demo-remove-registry-` prefix so leftover dirs are easy to spot and clean.
