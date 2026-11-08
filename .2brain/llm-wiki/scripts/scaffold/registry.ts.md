---
source: scripts/scaffold/registry.ts
sha256: 0dd63b89c69c1f02c0e6b734e18a47ee2be352d1a8597b329f4e2f8b855ee04d
generated_at: 2026-11-08T03:00:26.980813+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/registry.ts

## Purpose

Performs the single central edit a new module requires in `src/modules.ts`: inserting the import line, the `enabledModules` array entry, and the `ModuleName` union member, each in alphabetical order. Designed as pure text-in / text-out so it can be tested without a repository checkout.

## Key elements

- **`registerModule(source, names)`** *(exported)* — Orchestrates the three insertions (import, array entry, union member) and returns the edited source string. Throws if the expected file shape is missing.
- **`isRegistered(source, kebab)`** *(exported)* — Returns `true` when the import line for `kebab` already exists in `source`.
- **`importKey(line)`** *(exported)* — Extracts the folder name from an `import … from './modules/<name>/module'` line.
- **`entryKey(line)`** *(exported)* — Normalises an array-entry line (strips whitespace and commas) to get its sort key.
- **`memberKey(line)`** *(exported)* — Extracts the quoted name from a `| 'name'` union-member line.
- **`insertInRun`** *(internal)* — Finds the first run of consecutive lines matching a predicate and inserts a new line at the correct sorted position within that run.
- **`retermRun`** *(internal)* — Rewrites trailing terminators (comma / semicolon) across a run after insertion has shifted which line is last.
- **`isEntry` / `isMember`** *(internal)* — Regex predicates identifying `enabledModules` array-entry lines and `ModuleName` union-member lines.
- **`splitAfter(lines, marker)`** *(internal)* — Splits the line array after the first line starting with `marker`.

## Relationships

- **`scripts/scaffold/names.ts`** — Provides the `ModuleNames` type (identifier, kebab) consumed by `registerModule`.
- **`scripts/scaffold/apply.ts`** — Calls `registerModule` (and `isRegistered`) to apply or skip the central edit during a scaffold run.
- **`scripts/scaffold/central-edits.ts`** — Houses the other central edits; this module is the registry-specific one among them.
- **`scripts/scaffold/demo-remove-registry.ts`** — Demo script that exercises the registry in a removal scenario.
- **`tests/unit/scripts/scaffold/registry.test.ts`** — Unit tests covering insertion, ordering, terminator rewriting, and error paths.

## Notes

- **Sort keys differ per section.** Imports are ordered by kebab folder name, array entries by identifier, union members by kebab. A name like `api-keys` (identifier `apiKeys`) sorts differently in the import list vs. the array list; each list stays sorted by whatever it prints.
- **Terminators are fixed *after* insertion.** `retermRun` runs post-insertion because the "last line" of a run shifts when a new line is added. It strips any existing `[,;]` and re-applies the correct terminator (`,` for non-final, `''` or `';'` for the final line).
- **Strict shape assumption.** `splitAfter` and `insertInRun` throw descriptive `Error`s when the expected marker line or run is absent. The file does not attempt to recover from a differently-structured `src/modules.ts`.
- **Line format is fixed.** `isEntry` expects exactly four leading spaces + an identifier; `isMember` expects four spaces + `| '`. Indentation changes in the target file will break detection.
