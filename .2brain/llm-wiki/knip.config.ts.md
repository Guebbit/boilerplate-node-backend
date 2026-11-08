---
source: knip.config.ts
sha256: 5430dc2035ee4f5801916cc96a611642ba58542a422241a27f98044a31e6203a
generated_at: 2026-11-08T02:25:47.359420+00:00
model: ollama:qwen3.8:27b
---

# knip.config.ts

## Purpose

Configuration for [Knip](https://knip.dev), a tool that walks imports from entry points to flag unused files, exports, and dependencies. This file tells Knip about code and dependencies that an import walk cannot discover on its own (runtime-spawned tools, directory-scanned files, container entrypoints, etc.). It is consumed by the `code-shape` audit (`scripts/audit/code-shape/SKILL.md`) as input to a judgment pass — Knip's output here is a candidate list, not a verdict.

## Key elements

- **`entry`** — Additional entry-point globs beyond what Knip's `package.json`/`jest`/`eslint` plugins auto-detect: module barrels (`src/modules/*/index.ts`), probe files, Docker entry scripts, load-test scripts, the Stryker mutation Jest config, and VitePress config/theme files.
- **`ignoreDependencies`** — npm packages that are used but never statically imported (spawned by path, loaded by tool name from `stryker.json`, built into the k6 runtime, peer-deps of a mutation transform, or plugin names referenced in YAML).
- **`ignoreBinaries`** — System binaries a script shells out to (currently `openssl`).
- **`ignoreUnresolved`** — Import specifiers that resolve at run time from a different root (e.g., a `tsx --import` path resolved from the repo root rather than the importing file).
- **`config` (default export)** — The `KnipConfig` object containing the above, typed from the `knip` package.

## Relationships

No graph neighbors are recorded for this file. It is a leaf configuration consumed only by the external `knip` CLI and, per the comment, by the `code-shape` audit script.

## Notes

- **Not a gate.** Knip's findings here feed the audit's judgment step; they are never enforced as pass/fail on their own.
- **Barrels are intentionally "unused."** `src/modules/*/index.ts` are listed as entries because they are public API surface; Knip would otherwise flag them. See `CLAUDE.md` § Module barrels.
- **`k6` is not an npm package** in this context — it is the runtime that `tests/load/*.js` executes inside. It appears in `ignoreDependencies` to suppress a false positive.
- **`@swc/jest` / `@swc/core`** are referenced only in `jest.config.mutation.js`, which Knip does not parse as a Jest config, so they must be listed here explicitly.
- **`ignoreUnresolved`** entries are path strings relative to the repo root, not to the importing file — do not expect standard Node/ESM resolution semantics when adding to this list.
