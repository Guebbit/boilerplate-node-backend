---
source: scripts/scaffold/demo-remove.ts
source_sha256: ac5d6508f306db8d59614250ed3e9a62e2d6f974a5c9a7ce6a3d7b7ce1b2df64
context_sha256: ee92646016dfbef52254ddc6260c3867b546c3badeb8439dbe3b2bbe06c5be7c
generated_at: 2026-11-22T02:15:31.925560+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/demo-remove.ts

## Purpose
Entry script for `npm run demo:remove`, the one-command strip of the demo content from this checkout. It deletes every `group: shop` and `group: example` module folder, the seed images, and the demo catalogue's scenario data. It then edits `src/modules.ts` and regenerates the scenario registries so the repo still compiles. It runs against the current checkout, not a scratch copy.

## Key elements
- `report(notes)`: prints each `RemovalNote` as `  <file> — <detail>`.
- `demoModuleNames`: result of `readDemoModuleNames(REPO_ROOT)`, the modules labelled shop or example.
- Step one: `removeModules(REPO_ROOT, demoModuleNames)` deletes the module folders and edits the central files that name them.
- Step two: `removeSeedImages` and `removeShopOnlyScenarioFiles` delete the demo catalogue's data. Neither edits any file.
- Step three: `writeScenarioRegistries(REPO_ROOT, formatWithRepoConfig)` rebuilds the scenario registries from what is left. The script then prints the manual next steps: `npm run regenerate`, then `npm run ts-check`.
- Failures in the async step go to `failScript`.

## Relationships
- `scripts/testing/demo-module-names.ts`: `readDemoModuleNames` supplies the list of modules to strip.
- `scripts/scaffold/demo-remove-modules.ts`: provides `removeModules`.
- `scripts/scaffold/demo-remove-registry.ts`: provides the `RemovalNote` type that `report` consumes.
- `scripts/scaffold/demo-remove-scenarios.ts`: provides `removeSeedImages` and `removeShopOnlyScenarioFiles`.
- `scripts/scaffold/scenario-registry.ts`: provides `writeScenarioRegistries`.
- `scripts/scaffold/format-text.ts`: provides `formatWithRepoConfig`, used to format the regenerated registries.
- `scripts/modules-on-disk.ts`: provides `REPO_ROOT`.
- `scripts/fail-script.ts`: provides `failScript`, the error handler.

## Notes
- The script is destructive and has no dry-run or confirmation. It announces what it will remove, then acts.
- Steps one and two run synchronously at module top level. Only the registry regeneration is async.
- Its header comment says tests are removed by `demo-remove-tests.ts`, which this file does not import directly. Presumably `removeModules` or the registry layer invokes it, but that isn't visible here.
- Success is not verified here. Leftover references to removed modules in strings or tables (not imports) must be fixed by hand after `npm run ts-check`.
