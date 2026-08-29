# tests/cross-cutting/module-shape.test.ts

## Purpose

Cross-cutting test that enforces structural invariants no type system can: every module folder is registered, every registered name matches a folder, controller presence and `basePath` co-occur, and module barrels don't leak demo fixtures. It exists because the three places a module announces itself (its directory, its entry in `enabledModules`, its manifest) are checked by nothing at compile time.

## Key elements

- **`DELIBERATELY_DISABLED: string[]`** — Allowlist (intentionally empty) of folders that exist on disk but are *not* registered. Any entry requires justification in review.
- **`moduleFolders()`** — Returns directory names under `src/modules/`; the single source of truth for "what modules exist on disk."
- **`hasControllers(module)`** — Boolean check for a `controllers/` subdirectory, used by the mount/unmount tests.
- **`describe('the shape every module declares', …)`** — The test suite. Each `it` block enforces one invariant:
  - *Canary* (≥ 10 folders, ≥ 10 registry entries) — prevents a misconfigured path from silently passing all checks on an empty set.
  - *Name ↔ folder* — every `enabledModules[].name` must correspond to an actual directory.
  - *Folder → registration* — every directory must appear in `enabledModules` (or be in `DELIBERATELY_DISABLED`).
  - *Disabled list hygiene* — `DELIBERATELY_DISABLED` contains no stale folder names.
  - *Controllers ⇒ `basePath`* — a module with a `controllers/` dir must declare a `basePath`.
  - *`basePath` ⇒ controllers* — a module declaring a `basePath` must have a `controllers/` dir.
  - *Unit-test presence* — every module has a `tests/unit/` directory.
  - *No barrel demo re-export* — `index.ts` must not import from `./demo`.
  - *`basePath` format* — must match `/^(?:\/[\da-z][\da-z-]*)+$/` (single leading slash, no trailing slash, lowercase alphanumeric segments).

## Relationships

- **`src/modules.ts`** — sole import: `enabledModules`. The test reads names and `basePath` values from this array to validate them against the filesystem.
- **`src/modules/<name>/` (filesystem)** — the test reads directory listings, checks for `controllers/`, `tests/unit/`, `index.ts`, and `demo.ts` references. It does not import from individual modules.
- **`kernel/registry.ts`** — referenced in comments: the type union there ties `basePath` to `routes` but cannot see the `controllers/` directory; this test covers that gap.
- **`controller-naming.test.ts`, `service-namespaces.test.ts`** — sibling cross-cutting tests covering a module's *insides*; this file explicitly does not overlap with them.
- **`eslint-plugin-boundaries` / `eslint.config.ts`** — the barrel-leak check and the unit-test-presence check enforce rules the linter cannot express (intra-element edges; directory existence).
- **`app.ts`** — referenced in comments: concatenates `basePath` values; the format test exists because a malformed path produces 404s rather than a type error.

## Notes

- The naming test reads from `enabledModules[].name` (the running app's identity), not from disk, so it catches a manifest that renamed itself away from its folder.
- `DELIBERATELY_DISABLED` is designed to stay empty; the stale-name test exists specifically to prevent a forgotten entry from silently excusing a re-added folder.
- The barrel-leak check uses a regex over the raw text of `index.ts` (`from './demo'` or `require('./demo')`); it is a string-level guard, not an AST check.
- The `basePath` regex allows only lowercase alphanumerics and hyphens per segment — uppercase or special characters will fail this test even if they are technically valid URL characters.
