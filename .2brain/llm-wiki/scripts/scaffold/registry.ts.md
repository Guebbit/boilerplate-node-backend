---
source: scripts/scaffold/registry.ts
source_sha256: 146767a2bc9a9fc1ea2b2933c36a57359df58316717bb294342d1bd8a7fc70be
context_sha256: f40bafc0213405a7eba459f64f7bbddd4679dc6c430ff5975e6ea4fd269120a2
generated_at: 2026-11-22T02:16:16.688104+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/registry.ts

## Purpose
Performs the single central edit a newly scaffolded module needs in `src/modules.ts`: adding its import line, its entry in the `enabledModules` array, and its member in the `ModuleName` union type. It works as pure text in, text out, so it can be tested without a checkout.

## Key elements
- `registerModule(source, names)`: the main export. Takes the text of `src/modules.ts` and a `ModuleNames` object, and returns the edited text. It inserts `import <identifier> from './modules/<kebab>/module';`, `    <identifier>,` in the array, and `    | '<kebab>'` in the union, keeping each list alphabetical. It throws if the file's shape is not the one it understands.
- `isRegistered(source, kebab)`: true when an import line for that module folder name already exists.
- `importKey`, `memberKey`, `entryKey`: exported sort-key extractors. They pull the folder name from an import line, the quoted name from a union member line, and the identifier from an array-entry line.
- Internal helpers:
  - `insertInRun`: inserts a line into the first run of consecutive matching lines, in key order. It throws if no line matches.
  - `retermRun`: rewrites the terminators of the first run after insertion. Non-final lines get `ending` and the final line gets `last` (`,`/`''` for the array, `''`/`;` for the union).
  - `splitAfter`: splits the lines after a marker line (`export const enabledModules`, `export type ModuleName`). It throws if the marker is missing.
  - `isEntry` and `isMember`: regexes that recognise array-entry and union-member lines. Both expect 4-space indentation.

## Relationships
- Imports the `ModuleNames` type from `./names`. It uses the `kebab` and `identifier` spellings from it.
- The listed neighbors `apply.ts`, `central-edits.ts` and `demo-remove-registry.ts` are presumably the callers or sibling edit steps. That is inferred from the names, since none of them appear in this file.
- `tests/unit/scripts/scaffold/registry.test.ts` tests the text transformation directly.

## Notes
- Import lines are sorted by folder name (kebab). Array entries are sorted by identifier. For a name like `api-keys` the two orders differ, and each list stays sorted by what it prints.
- Terminators are fixed after insertion rather than tracked during it, because inserting can move the last line.
- Only the first matching run of each kind is edited. Entry and member lines are searched only after their marker lines.
- `registerModule` does not check `isRegistered` itself, so callers need to guard against duplicate registration.
