---
source: scripts/scaffold/registry.ts
sha256: 0dd63b89c69c1f02c0e6b734e18a47ee2be352d1a8597b329f4e2f8b855ee04d
generated_at: 2026-10-15T09:47:17.523396+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/registry.ts

## Purpose

Provides a single pure text-transformation (`registerModule`) that inserts the three required lines for a new module into `src/modules.ts` — the import, the `enabledModules` array entry, and the `ModuleName` union member — each kept in alphabetical order. Because it operates on raw source text rather than the filesystem, it is unit-testable without a repository checkout.

## Key elements

- **`registerModule(source, names)`** *(exported)* — The public entry point. Accepts the full text of `src/modules.ts` and a `ModuleNames` object; returns the edited text with all three registrations inserted in sorted position.
- **`isRegistered(source, kebab)`** *(exported)* — Returns `true` if the kebab-case folder name already has an import line in the source.
- **`importKey(line)`** *(exported)* — Extracts the folder name from an `import … from './modules/<name>/module'` line (empty string if not an import).
- **`entryKey(line)`** *(exported)* — Normalises an array-entry line (strips whitespace/commas) to yield the identifier for sorting.
- **`memberKey(line)`** *(exported)* — Extracts the quoted name from a `| 'name'` union-member line.
- **`insertInRun(lines, belongs, keyOf, line, key)`** *(internal)* — Inserts `line` into the first consecutive run where `belongs` is true, positioning it by `keyOf`. Throws if no such run exists.
- **`retermRun(lines, belongs, ending, last)`** *(internal)* — Rewrites line terminators on a run so non-final lines get `ending` and the final line gets `last` (handles trailing-comma / semicolon bookkeeping).
- **`splitAfter(lines, marker)`** *(internal)* — Splits the array at the first line beginning with `marker`; throws if not found.
- **`isEntry`, `isMember`** *(internal)* — Predicates identifying `enabledModules` array lines and `ModuleName` union-member lines by their indentation/shape.

## Relationships

- **`scripts/scaffold/names.ts`** — Supplies the `ModuleNames` type (the `identifier` / `kebab` pair) consumed by `registerModule`.
- **`scripts/scaffold/apply.ts`** — Orchestrates scaffold steps; calls `registerModule` (and likely `isRegistered` to skip already-present modules) as part of the apply pipeline.
- **`scripts/scaffold/central-edits.ts`** — Aggregates or re-exports the central-edit functions; this module is one of the edits it manages.
- **`scripts/scaffold/demo-remove-registry.ts`** — Demo/CLI that reverses the registration (removes the three lines); pairs with this file's insert logic.
- **`tests/unit/scripts/scaffold/registry.test.ts`** — Unit tests exercising `registerModule`, `isRegistered`, and the key-extraction helpers against in-memory source strings.

## Notes

- **Different sort keys per list:** imports are sorted by kebab folder name, array entries by identifier, and union members by kebab name. For hyphenated names (e.g. `api-keys`) these differ, and each list stays sorted by what it prints.
- **Terminator handling is post-insertion:** `retermRun` is called *after* `insertInRun` because the insertion can shift which line is last; tracking terminators during insertion would be fragile.
- **Structural assumptions:** The file must contain a contiguous run of `import … from './modules/…'` lines, an `export const enabledModules` array, and an `export type ModuleName` union. If any are missing or reshaped, the functions throw with a descriptive `src/modules.ts: …` error.
- **No I/O:** The module never reads or writes files; callers are responsible for reading `src/modules.ts` and writing the result back.
