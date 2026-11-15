---
source: scripts/scaffold/registry.ts
sha256: fbb4eebbdf763d020202a8863d050705b0842f5afdfd1cef2e1a84d7efb15316
generated_at: 2026-11-14T17:41:55.702193+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/registry.ts

## Purpose

Generates the three text edits a new module requires in `src/modules.ts` — the import statement, the `enabledModules` array entry, and the `ModuleName` union member — as a pure string-in/string-out transform. This keeps the logic unit-testable without a working checkout.

## Key elements

- **`registerModule(source, names)`** — Main export. Takes the current `src/modules.ts` text and a `ModuleNames` object, returns the edited text with all three insertions made in alphabetical order.
- **`isRegistered(source, kebab)`** — Checks whether a module (by its folder name) is already imported; used to skip redundant edits.
- **`insertInRun(lines, belongs, keyOf, line, key)`** *(internal)* — Finds a consecutive block of matching lines, locates the correct alphabetical position by `keyOf`, and splices the new line in. Throws if the block is absent.
- **`retermRun(lines, belongs, ending, last)`** *(internal)* — After an insertion, rewrites trailing terminators in a run (e.g. comma on all-but-last, semicolon on last) so the list stays syntactically valid.
- **`importKey(line)`** — Extracts the `<name>` from `./modules/<name>/module` in an import line.
- **`memberKey(line)`** — Extracts the quoted identifier from a `| 'name'` union member.
- **`entryKey(line)`** — Strips whitespace and commas to produce a sort key for an array-entry line like `    fieldNotes,`.
- **`isEntry(line)` / `isMember(line)`** *(internal)* — Regex predicates identifying lines in the `enabledModules` array or the `ModuleName` union, respectively.
- **`splitAfter(lines, marker)`** *(internal)* — Splits the line array into head (up to and including) and rest, anchored on a marker prefix.

## Relationships

- **`scripts/scaffold/names.ts`** — Provides the `ModuleNames` type (`identifier`, `kebab`, …) that `registerModule` consumes to build the import, entry, and member strings.
- **`scripts/scaffold/central-edits.ts`** — Likely the orchestration layer that calls `registerModule` and feeds the result to an apply step.
- **`scripts/scaffold/apply.ts`** — Expected consumer that writes the returned text to disk; this module is deliberately I/O-free so that `apply.ts` owns the filesystem.
- **`scripts/scaffold/demo-remove-registry.ts`** — Exercises the inverse (removal) path; useful as a reference for the line-shape conventions this module assumes.
- **`tests/unit/scripts/scaffold/registry.test.ts`** — Unit tests covering `registerModule`, `isRegistered`, and the key-extraction helpers.

## Notes

- Import lines are sorted by **folder name** (`kebab`), while array entries are sorted by **identifier**. For a name like `api-keys` these differ; the code sorts each list by the key that actually appears on that line.
- `retermRun` is applied *after* `insertInRun` because insertion can shift which line is last, changing which terminator (comma vs. semicolon/empty) is correct.
- The module hard-codes the 4-space indent and the `    | '` prefix for union members; `src/modules.ts` must follow that exact shape or `insertInRun` / `splitAfter` will throw.
- All exports are pure functions returning strings or booleans — there is no file I/O, no `fs` import, and no side effects.
