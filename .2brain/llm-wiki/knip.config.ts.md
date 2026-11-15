---
source: knip.config.ts
sha256: 6a1124b3de4fce6e4d965e36376cb00385c97b85f65aa38e5f14613db19eb4fd
generated_at: 2026-11-14T17:13:48.622227+00:00
model: ollama:qwen3.8:27b
---

# knip.config.ts

## Purpose

Knip configuration that supplements knip's automatic entry-point discovery (from `package.json`, Jest, ESLint) with paths and ignore rules knip cannot infer on its own. It is consumed by the `code-shape` audit as input for judging unused files, exports, and dependencies—not as a gate.

## Key elements

- **`config` (default export, type `KnipConfig`)** — the single configuration object Knip reads.
- **`entry`** — glob patterns for files/modules knip's plugins don't discover: module barrels, probe files, codegen scripts, scenario values, generated files, container entrypoints, load-test scripts, Stryker's jest config, and VitePress files.
- **`ignoreExportsUsedInFile`** — suppresses "unused export" findings for `interface` and `type` declarations consumed only within their own file.
- **`ignoreDependencies`** — npm packages used via spawn, runtime globals, or config-file references that an import walk misses (e.g. `@redocly/cli`, `k6`, `@swc/jest`, `@stryker-mutator/jest-runner`, `@stoplight/spectral-rulesets`).
- **`ignoreBinaries`** — system executables (`openssl`) that a script shells out to.
- **`ignoreUnresolved`** — runtime-resolved relative imports that don't resolve from the importing file's directory.

## Relationships

No dependency-graph neighbors. This file is a standalone configuration consumed by a tool (knip) and read by the `code-shape` audit; it does not import from or export to any other module in the repo.

## Notes

- **Not a gate.** The audit treats knip's output as *candidates* to judge, not verdicts.
- **Glob anchoring.** Every `entry` glob is anchored to a repo folder (e.g. `src/modules/*/…`). A leading `**/` would accidentally match worktrees and Stryker sandboxes.
- **Gitignored sources.** `scenarios/**/*.generated.ts` is gitignored, but Knip follows those imports to discover further dependencies—hence the explicit entry.
- **Conventional-path reliance.** VitePress and Stryker entry points are listed because no Knip plugin reads `stryker.json` or VitePress's directory conventions.
