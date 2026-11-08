---
source: tests/unit/scripts/modules/new-module-needs-nothing.test.ts
sha256: 0dcc69e355e57945a592c72df175170e3fa34c39df2c4ed48a126ab38f9b38fd
generated_at: 2026-11-08T10:37:57.314495+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/modules/new-module-needs-nothing.test.ts

## Purpose

Asserts the "genericity claim": a new module needs only its folder (`module.yaml`, `openapi.yaml`, optional `probes.ts`) and its entry in `src/modules.ts`—no hand-edited tables elsewhere. A throwaway `widgets` module is written into a temp directory, and every read-side consumer is asked whether it picks the module up automatically.

## Key elements

- **`scratch` / `modulesRoot()` / `write()`** — temp-directory helpers; `write` creates parent dirs and writes a single file.
- **`beforeAll`** — seeds the scratch tree with an existing `feedback` module and the throwaway `widgets` module (YAML descriptor, OpenAPI fragment, empty `probes.ts`, two docs pages). No registry file, no root edit.
- **`afterAll`** — `rmSync` the scratch tree.
- **`describe('a module folder alone is enough')`** — five cases:
  - Descriptor is read and `noAudit` defaults to `undefined`.
  - `assembleRoot` merges paths, tags, and `x-tagGroups` from the module fragment; no `shared/` file is created in the scratch tree.
  - `modulesDeclaringProbes` finds `widgets` solely by the presence of `probes.ts`.
  - `readCatalog` + `renderModuleList` + `moduleSidebar` surface the module under its `group` and link the deeper doc page.
  - `routedModulesOf` includes `widgets` when given a virtual registry entry.

## Relationships

- **`scripts/contracts/root-assembly.ts`** — `assembleRoot` and `readModuleFragments` are the functions under test for OpenAPI path/tag merging.
- **`scripts/contracts/client-collections-bundle.ts`** — `modulesDeclaringProbes` is tested to confirm `probes.ts` presence is the sole signal.
- **`scripts/docs/module-catalog.ts`** — `readCatalog`, `renderModuleList`, `moduleSidebar` are tested for docs-index and sidebar generation.
- **`scripts/docs/module-descriptor.ts`** — `readAllModuleDescriptors` is tested for YAML parsing.
- **`scripts/modules-on-disk.ts`** — `REPO_ROOT` is imported to locate the real repo's `shared/contracts/openapi.root.yaml` (used as the root template).
- **`tests/support/routes.ts`** — `routedModulesOf` is tested with a virtual registry to confirm router-guard membership.

## Notes

- The scratch tree deliberately has **no** `src/modules.ts` (registry) and **no** root OpenAPI file; the test asserts read-side functions don't require them.
- The root OpenAPI template is read from the **real repo** (`REPO_ROOT`), not the scratch tree, so the assertion "root file untouched" checks that `shared/` was not created inside scratch.
- The router-guard case uses a hand-built array (a "virtual registry") because the disk-based registry path is not exercised here.
- `widgets` is assigned `group: shop` specifically to verify sidebar grouping renders as "Demo shop".
