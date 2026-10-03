---
source: scripts/scaffold/registry.ts
sha256: 915121b6d205c238812d533229220a4627efa22ca109c0e4ebd11bcce0ec4a17
generated_at: 2026-10-01T12:39:50.071979+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/registry.ts

## Purpose

Provides the single central edit a new module requires in `src/modules.ts` — its import line, its `enabledModules` array entry, and its `ModuleName` union member. The functions are pure text-in/text-out so the edit can be unit-tested without a working checkout.

## Key elements

- **`insertInRun`** – inserts a new line into the first consecutive run of lines matching a predicate, keeping the run ordered by a sort-key function. Throws if no run is found.
- **`importKey` / `memberKey` / `entryKey`** – extract the sort key (folder name, quoted name, or bare identifier) from each of the three line shapes.
- **`isRegistered`** *(exported)* – returns `true` if the source text already contains the import line for a given kebab folder name.
- **`retermRun`** – after an insertion, rewrites the trailing terminator (`,` / `;` / empty) of every line in a run so the new last line gets the correct one.
- **`isEntry` / `isMember`** – predicates that identify 4-space-indented array-entry lines and `| '…'` union-member lines respectively.
- **`splitAfter`** – splits the line array at the first line starting with a given marker string (used to isolate the array and union regions).
- **`registerModule`** *(exported)* – orchestrates the three insertions (import → array entry → union member), each kept alphabetically sorted by its own key, and returns the edited source text.

## Relationships

- **`scripts/scaffold/names.ts`** – supplies the `ModuleNames` type (kebab, identifier, etc.) consumed by `registerModule` and `isRegistered`.
- **`scripts/scaffold/apply.ts`** – the scaffold runner that calls `isRegistered` to skip already-registered modules and `registerModule` to produce the edit.
- **`scripts/scaffold/central-edits.ts`** – sibling module handling other cross-cutting file edits; `registry.ts` covers only the `src/modules.ts` edit.
- **`tests/unit/scripts/scaffold/registry.test.ts`** – unit tests exercising `isRegistered` and `registerModule` against representative `src/modules.ts` fixtures.

## Notes

- **Three different sort keys.** Import lines are ordered by kebab folder name, array entries by identifier, union members by kebab. For hyphenated names (e.g. `api-keys` → `apiKeys`) these differ, and each list stays sorted by what it literally prints.
- **Terminator rewriting is separate from insertion.** `insertInRun` does not touch commas or semicolons; `retermRun` runs afterwards because the "last line" of a run shifts after insertion.
- **Structural assumptions are hard-coded.** The functions expect 4-space indentation for entries/members, the markers `export const enabledModules` and `export type ModuleName`, and the import path pattern `./modules/<name>/module`. If `src/modules.ts` is restructured, the predicates and markers here must change in lock-step.
- **No filesystem access.** The module is deliberately side-effect-free; callers read the file, pass the string in, and write the string back.
