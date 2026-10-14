---
source: knip.config.ts
sha256: 9f7690314ca4623a55a8ddbd9f0e555c6c42213f1bab05d80cf591d0ee0424b2
generated_at: 2026-10-14T06:53:57.899323+00:00
model: ollama:qwen3.8:27b
---

# knip.config.ts

## Purpose

Knip configuration that supplements knip's built-in import-walk discovery. It declares entry points, dependencies, and unresolved imports that knip cannot see from its own plugins (package.json, jest, eslint), so the tool's unused-file/dependency report reflects the project's actual surface rather than flagging legitimate code. The file is consumed by the `code-shape` audit script (`scripts/audit/code-shape/SKILL.md`), never by a gate.

## Key elements

- **`config: KnipConfig`** (default export) — the sole export; a plain object Knip reads at runtime.
  - **`entry`** — additional entry-point globs beyond what Knip's plugins derive: module barrels (`src/modules/*/index.ts`), probe files, container scripts, load-test scripts, the Stryker jest config, and VitePress docs config/theme.
  - **`ignoreDependencies`** — npm packages that are used but never imported: `@redocly/cli` (spawned by path), `k6` (runtime builtin), `@swc/jest` + `@swc/core` (referenced only inside `jest.config.mutation.js`, which Knip does not parse as a jest config).
  - **`ignoreUnresolved`** — a single relative import (`./scenarios/support/development-doubles.ts`) resolved at runtime via `tsx --import` from the repo root.

## Relationships

No graph neighbors.

## Notes

- Every entry in `entry`, `ignoreDependencies`, and `ignoreUnresolved` exists because Knip's import-walk *cannot* discover the usage. If the consuming mechanism changes (e.g., the file becomes importable, or a Knip plugin starts reading `stryker.json`), the corresponding line should be removed.
- The config is intentionally minimal: it states facts Knip is blind to. It does not suppress or whitelist findings — the `code-shape` audit makes the judgment call on each candidate Knip reports.
- `src/modules/*/index.ts` (barrels) are listed as entries *because they are the public API surface*, not because they import everything; see `CLAUDE.md` § Module barrels for the convention.
