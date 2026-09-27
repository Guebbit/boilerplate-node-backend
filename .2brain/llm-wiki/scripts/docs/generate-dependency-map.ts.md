---
source: scripts/docs/generate-dependency-map.ts
sha256: 24c94d18f670183d659a4436bdb3eb69919ad9e527715e5798b9d162be34a561
generated_at: 2026-09-27T13:55:19.975487+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-dependency-map.ts

## Purpose

A CLI script (`tsx`) that regenerates the two dependency tables (Runtime / Dev) in `docs/tools/package-dependencies.md`. It derives the package list from `package.json`, scans production source files to determine which module (if any) imports each package, and merges that with hand-kept group definitions. Running with `--check` (the default in `complete`) reports drift instead of rewriting, so the page stays accurate without a human re-copying a list.

## Key elements

- **`checkOnly`** – flags `--check` mode; when set, the script reports differences rather than writing.
- **`SCAN_DIRECTORIES` / `SCAN_FILES`** – the three top-level dirs (`src`, `scenarios`, `scripts`) and five root config files whose imports are inspected; `tests/` folders and `*.test.*` / `*.spec.*` files are excluded.
- **`ALIAS_PREFIXES`** – tsconfig path aliases (`@api/`, `@modules/`, `@infrastructure/`, …) filtered out so they are never mistaken for npm packages.
- **`walk(directory)`** – recursively collects `.ts`/`.js`/`.mjs`/`.cjs` files, pruning `tests/` subdirectories and test files.
- **`ownerOf(file)`** – maps a file path to a coarse ownership label (`module:<name>`, `kernel`, `infrastructure`, `scenarios`, `scripts`, `app`).
- **`importSpecifiers(source)`** – regex-extracts `from "…"` / `require("…")` targets, filtering builtins and aliases.
- **`packageFor(specifier, packages)`** – resolves a specifier (possibly a subpath) to its top-level package name.
- **`readOwnership(packages)`** – the main scan loop: builds a `Map<packageName, Set<owner>>`; **throws** if a specifier resolves in `node_modules` but is absent from `package.json` (the "undeclared import" guard).
- **`soleModuleOwner(owners)`** – returns the module name only when exactly one `module:*` owner exists.
- **`groupRows` / `moduleOwnedRow` / `ungroupedTable`** – render the three tiers of the output table: hand-kept groups, single-module-owned packages, and the catch-all "Ungrouped" section.
- **`apply()`** – reads the manifest, computes both tables, and calls `applyMarkerBlocks` to splice them between the HTML-comment markers in the page (or diffs in `--check` mode).

## Relationships

- **`scripts/docs/dependency-groups.ts`** – imported for `RUNTIME_GROUPS`, `DEV_GROUPS`, `matchesGroup`, and the `DependencyGroup` type. These are the hand-kept group names, purpose strings, read-more links, and regex/prefix matchers the script uses to bucket packages.
- **`scripts/docs/marker-block.ts`** – imported for `applyMarkerBlocks`, which performs the actual read-modify-write of the markdown page between the four `<!-- dependency-map:{runtime|dev}:{start|end} -->` comment pairs, leaving surrounding prose untouched.

## Notes

- **Ownership granularity is intentionally coarse.** Only `src/modules/<name>/` can claim a package as "sole owner." Anything in `src/kernel/`, `src/infrastructure/`, etc., is grouped into a shared-area bucket and *cannot* produce a single-owner row — a package imported from both `kernel` and `module:auth` will land in "Ungrouped."
- **The undeclared-import guard throws at scan time**, not at render time. A package that exists in `node_modules` (pulled transitively) but is missing from `package.json` will crash the script with a diagnostic naming the offending file.
- **`--check` is non-destructive** and is what `complete` invokes; it exits non-zero on drift so CI catches a stale page.
- The script reads `package.json` but **ignores version strings** entirely — only the key names matter.
- New groups must be added to `dependency-groups.ts`, not inline here; the script has no CLI flag for adding a group.
