# tests/cross-cutting/published-language.test.ts

## Purpose

Cross-cutting test that enforces the "barrel as published language" rule: a module's `index.ts` may export only the names that at least one *sibling* module actually imports. It exists to prevent barrels from accumulating dead exports (or entire barrels) that promise stability to no one, making the module surface a structural guarantee rather than a polite convention.

## Key elements

- **`MODULES_ROOT`** — resolved path to `src/modules/`, the root of all domain modules.
- **`listFiles(dir)`** — recursively collects every `.ts` file under a directory.
- **`clauseNames(clause)`** — splits a `{ a, type B }` clause into bare names, stripping `type` prefixes.
- **`moduleNames()`** — returns the top-level directory names under `MODULES_ROOT`.
- **`publishedBy(name)`** — reads `<module>/index.ts`, extracts every exported name via regex (`export { … }` / `export type { … }`), resolves `as` aliases to the *published* side, and returns a `Set<string>` or `undefined` if no barrel exists.
- **`consumedFromBarrels()`** — walks every `.ts` file in `src/`, matches `import { … } from '@modules/<target>'` (excluding the owning module), resolves `as` aliases to the *imported* side, and returns `Map<module, Set<consumed names>>`.
- **Test suite** (`describe 'a barrel publishes exactly what a sibling imports'`):
  - *Canary check* — asserts the sweep actually discovered modules and at least one barrel, so an empty pass means "nothing is published" rather than "the walk broke."
  - *No dead exports* — every name a barrel publishes must appear in at least one sibling's import list.
  - *No pointless barrels* — a module with an `index.ts` must have at least one sibling importing it.

## Relationships

No graph neighbors are recorded for this file. It reads the filesystem directly (`src/modules/**`) and has no runtime imports from the project's source or other test files.

## Notes

- **Self-imports are excluded.** A module's own specs or internal `index.ts` re-exports do not count as consumption; the rule is "sibling only." This prevents a module from keeping an export alive purely by testing it.
- **Type exports are held to the same rule as value exports.** The file's header explicitly treats `export type { OrderDocument }` as a promise to siblings, not a free annotation.
- **Regex-based, not AST.** Export and import parsing uses `matchAll` with hand-written patterns. Multi-line import braces or dynamic `import()` calls would be missed.
- **`as` handling is asymmetric by design.** On the publish side, `export { a as b }` counts as publishing `b` (the caller's name). On the consume side, `import { a as b }` counts as consuming `a` (the barrel's name). Both resolve to the name the barrel wrote.
- **The canary test guards against silent vacuous passes.** Without it, a path-configuration bug would make every assertion pass because both `publishedBy` and `consumedFromBarrels` would operate on an empty set.
