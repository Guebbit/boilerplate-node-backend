---
source: knip.config.ts
sha256: 5430dc2035ee4f5801916cc96a611642ba58542a422241a27f98044a31e6203a
generated_at: 2026-10-29T01:19:59.071661+00:00
model: ollama:qwen3.8:27b
---

# knip.config.ts

## Purpose

TypeScript configuration for [Knip](https://knip.dev), a tool that walks imports from entry points to surface unused files, exports, and dependencies. This file only declares things Knip's own plugins cannot discover (non-import entry points, runtime-loaded deps, spawned binaries); the results it produces are *candidates* for the `code-shape` audit to judge, not verdicts.

## Key elements

- **`config` (default export, `KnipConfig`)** — the sole exported value; a plain object with four sections:
  - **`entry`** — additional entry points beyond what Knip auto-discovers from `package.json`, Jest, and ESLint. Covers module barrels (`src/modules/*/index.ts`), probe files, Docker scripts, k6 load-test scripts, the Stryker mutation Jest config, and VitePress docs config.
  - **`ignoreDependencies`** — npm packages used in ways an import-walk cannot see (spawned CLI tools like `@redocly/cli`, runtime-builtin `k6`, Stryker/SWC transforms loaded by name, Spectral rulesets referenced from YAML).
  - **`ignoreBinaries`** — system binaries a script shells out to (currently only `openssl`).
  - **`ignoreUnresolved`** — dynamic import paths that resolve at run time relative to the repo root rather than the importing file (one `tsx --import` argument).

## Relationships

No graph neighbors. This file is a leaf configuration consumed by the `code-shape` audit step (`scripts/audit/code-shape/SKILL.md`); it is explicitly **not** read by any gate.

## Notes

- Every entry carries a comment naming *who* uses the file/dep and *why* Knip can't see it — preserve that context when adding or removing entries.
- `src/modules/*/index.ts` are intentionally "unused" barrels (see `CLAUDE.md` § Module barrels); do not treat Knip flagging them as an error.
- `jest.config.mutation.js` is excluded from Knip's own Jest detection because Knip reads the *primary* Jest config, not the Stryker-specific one.
- This file is read **only** by the audit, never by a CI gate — changes here do not block a merge on their own.
