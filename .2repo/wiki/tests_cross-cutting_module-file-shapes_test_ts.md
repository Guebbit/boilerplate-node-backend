# tests/cross-cutting/module-file-shapes.test.ts

## Purpose

Enforces that every file inside `src/modules/<name>/` matches a named "shape" in a closed regex catalogue. Any file that matches no pattern (or any pattern that matches no file) fails the suite, forcing a deliberate, two-file act (add pattern here + add row in `docs/reference/src-modules.md`) before a new file kind can appear in a module folder.

## Key elements

- **`MODULE_FILE_SHAPES`** — `readonly RegExp[]` of ~28 patterns (e.g. `module.ts`, `routes.ts`, `controllers/*.ts`, `services/*.ts`, `tests/unit/*.ts`). This is the single source of truth for which relative paths are legal inside a module directory.
- **`walk(directory, base)`** — recursive directory walker that returns all file paths relative to `base`, normalises backslashes, and skips `__snapshots__` folders.
- **`everyModuleFile()`** — flattens `enabledModules` × `walk(...)` into `{ module, file }[]` pairs for the whole module tree.
- **Test: "actually reads the module tree"** — canary asserting the scan is non-empty (guards against a silently empty `enabledModules` or wrong `MODULES_ROOT`).
- **Test: "finds no file matching no shape"** — forward check: every discovered file must match at least one pattern.
- **Test: "keeps the catalogue free of shapes nothing matches"** — reverse check: every pattern must match at least one file (catches stale/renamed shapes).

## Relationships

- **`src/modules.ts`** — imports `enabledModules`, the authoritative list of module names and their `name` field that drives which directories are scanned.
- **`docs/theory/modules.md`** — cited in the file's header comment (`#what-a-module-contains`) as the prose companion that explains *what* each shape is; this test only asserts *which* shapes exist.

## Notes

- Patterns are **order-irrelevant** (set-membership, not first-match-wins). Sub-path patterns like `services/index.ts` and `domain/index.ts` were removed because their parent patterns (`services/.+\.ts`, `domain/.+\.ts`) already cover them.
- The `MODULES_ROOT` is computed relative to `__dirname` (`../../src/modules`), so the test must be run from the repo root or a path that preserves that relative layout.
- Adding a new shape requires updating **two** files: the regex array here and a row in `docs/reference/src-modules.md`. The file's comment explicitly warns against duplicating prose descriptions here.
- The reverse test (unused shapes) is intentional: a dead pattern silently widens what the forward test accepts, so it is treated as a defect equivalent to an unnamed file.
