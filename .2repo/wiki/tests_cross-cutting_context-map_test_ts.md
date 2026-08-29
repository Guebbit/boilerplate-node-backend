# tests/cross-cutting/context-map.test.ts

## Purpose

Validates that the `dependsOn` context map declared in each module's manifest is in lockstep with the actual cross-module imports in the codebase, and that every declared edge carries a valid relationship label and a substantive reason. It turns the `dependsOn` field from a decorative annotation into an enforced contract.

## Key elements

- **`SHARED_KERNEL_ALLOWLIST`** — a `Set` of permitted `shared-kernel` edges (currently only `account→users`); any other edge labelled `shared-kernel` fails the test.
- **`listFiles(directory)`** — recursive walker that returns every `.ts` file under a given directory.
- **`importedSiblings(owner)`** — scans a module's production source (test files excluded) for `@modules/*` import patterns via regex and returns the set of sibling modules actually imported.
- **`declaredEdges()`** — flattens `enabledModules` into a flat array of `{ from, to, as }` tuples from each manifest's `dependsOn` array.
- **`describe` block: "the context map describes the imports that exist"** — four tests: canary (modules exist), no stale declared edges, no undeclared imports, shared-kernel allowlist enforcement.
- **`describe` block: "every edge is labelled, not merely present"** — six tests: label must be one of the four `KINDS`, `because` must be ≥ 20 chars, `because` must be ≥ 5 words (names something reachable), no self-edges, every edge target must be an enabled module, no duplicate edges to the same sibling.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` and `ContextRelationship` types used to type-annotate the test's local helpers. The `KINDS` set in the test intentionally re-spells the `ContextRelationship` union as a runtime `Set`, because the type is erased and a manifest could otherwise carry an arbitrary string.
- **`src/modules.ts`** — provides `enabledModules`, the list of registered modules the test iterates over. All assertions (stale edges, undeclared imports, dangling targets, duplicate edges) are computed against this array.

## Notes

- Imports are detected by regex over raw source text (`/"'@modules\/([^"'/]+)/g`), not by module resolution. This mirrors the approach of `eslint-plugin-boundaries` and keeps the test independent of the app booting.
- Files under a `tests/` subdirectory within a module are skipped during the import scan, so cross-module test fixtures do not count as production dependencies.
- The 20-char / 5-word thresholds on `because` are deliberately low: they distinguish "was thought about" from "was waved through," not enforce prose style.
- The canary test (`enabledModules.length > 0`) exists to distinguish "no dependencies exist" from "the file-walk or module list silently broke."
- Adding a new `shared-kernel` entry or a fifth relationship kind is a two-file edit (this test + the manifest), which is the intended friction.
