---
source: knip.config.ts
source_sha256: 5f8778e1b4bdc7b096a283f9cbdf8c952007e5a35cc0e279e5457969cf8e930a
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T01:40:18.197758+00:00
model: claude-code:claude-sonnet-5-5
---

# knip.config.ts

## Purpose
Configuration for [knip](https://knip.dev), which reports unused files, exports and dependencies by walking imports from entry points. Its output is read by the `code-shape` audit, never by a gate. The file only declares what knip cannot discover on its own, so reported items are candidates for the audit to judge, not verdicts.

## Key elements
- **`config` (default export, `KnipConfig`)** – the single configuration object, with these fields:
- **`entry`** – extra entry points beyond those knip's plugins find from `package.json`, jest and eslint:
  - Module barrels `src/modules/*/index.ts`: public surface, unused on purpose.
  - `src/modules/*/probes.ts` and `scenarios/values/*.ts`: loaded by directory scan in `scripts/contracts/client-collections-bundle.ts`.
  - `src/modules/*/rules.schema.ts`: dynamically imported by `scripts/contracts/generate-shared-rule-schemas.ts`.
  - `scripts/docs/generate-*.ts`: spawned by `scripts/regenerate-artifacts.ts`.
  - `scenarios/**/*.generated.ts`: gitignored, so listed as entries so that knip reads what they import.
  - `docker/*.{js,mjs}` and `tests/load/*.js`: run in containers or by the load-test tool.
  - `jest.config.mutation.js` (named by `stryker.json`) and `jest.config.replicas.js` (named by the `--config` flag of `npm run test:replicas`).
  - `tests/replicas/support/write-notification.ts`: spawned by path from `tests/replicas/notification-fanout.test.ts`.
  - VitePress files `docs/.vitepress/config.mts`, `docs/.vitepress/theme/index.ts` and `docs/.vitepress/theme/mermaid-options.ts`; the last is named explicitly because knip cannot read the `.vue` file that imports it.
- **`ignoreExportsUsedInFile`** – `{ interface: true, type: true }`; interfaces and types used only within their own file's exported shape are not reported.
- **`ignoreDependencies`** – dependencies used in ways an import walk cannot see:
  - `mermaid`: imported by `.vue` files.
  - `@redocly/cli`: spawned by `scripts/contracts/openapi-bundle.ts`.
  - `k6`: built into the k6 runtime, not an npm package.
  - `@swc/jest` and `@swc/core`: the mutation run's transform and its peer.
  - `@stryker-mutator/jest-runner`: loaded by name from Stryker's config (`testRunner: "jest"`).
  - `@stoplight/spectral-rulesets`: provides `spectral:oas` and `spectral:asyncapi` to `shared/contracts/spectral*.yaml`.
- **`ignoreBinaries`** – `openssl`, shelled out to by `scenarios/tools/generate-webhook-sink-tls.ts`.

## Relationships
No graph neighbors. It references other files only by path or in comments (scripts, jest configs, VitePress config). It does not import them. Its only import is the `KnipConfig` type from `knip`.

## Notes
- Every `entry` glob is anchored to a repo folder. A leading `**/` would also match the worktrees and the stryker sandboxes.
- knip globs `entry` patterns without applying `.gitignore`, which is why the gitignored generated scenario files can be listed as entries.
- Module barrels are intentionally unused public surface (see `CLAUDE.md` § Module barrels).
