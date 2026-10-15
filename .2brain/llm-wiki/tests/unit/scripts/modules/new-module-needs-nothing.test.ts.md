---
source: tests/unit/scripts/modules/new-module-needs-nothing.test.ts
sha256: 6c5e5a05080b8c081a06d0594fb07d0284f2e41b37f1db0457b65514de910c12
generated_at: 2026-10-15T13:28:06.286041+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/modules/new-module-needs-nothing.test.ts

## Purpose

Asserts the "genericity" invariant: adding a new module folder (with its `module.yaml`, `openapi.yaml`, optional `probes.ts`, and docs) requires no hand-edits to any shared table or registry. A throwaway `widgets` module is written into a temp tree, and every function that reads the module tree is checked to confirm it picks the module up automatically.

## Key elements

- **`beforeAll` / `afterAll`** — Creates a `mkdtempSync` scratch tree containing an existing `feedback` module and the new `widgets` module (yaml, openapi, empty `probes.ts`, two docs pages). Cleans up on completion.
- **`write` helper** — Writes a file into the scratch tree, creating parent directories as needed.
- **`modulesRoot()`** — Returns `<scratch>/src/modules`, the path passed to every tree-reading function under test.
- **Five test cases** (all under `describe('a module folder alone is enough')`):
  1. *Descriptor + frontend counterpart* — `readAllModuleDescriptors` returns both modules; `frontendCounterparts` defaults to the module's own name; `noAudit` stays `undefined`.
  2. *Root contract assembly* — `assembleRoot` + `readModuleFragments` merges the module's openapi paths and tags into the real `openapi.root.yaml` without writing anything back to `shared/`.
  3. *Client collections* — `modulesDeclaringProbes` finds `widgets` via its `probes.ts`.
  4. *Docs catalogue & sidebar* — `readCatalogue`, `renderModuleList`, and `moduleSidebar` all surface the new module under its declared group, including a "deeper" page link.
  5. *Router guard set* — `routedModulesOf` (from test support) recognises `widgets` once it appears in a (virtual) registry entry; no disk registry file was written.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scripts/contracts/client-collections-bundle.ts` | Imports `modulesDeclaringProbes`; called with `modulesRoot()` to verify the new module is detected via its `probes.ts`. |
| `scripts/contracts/root-assembly.ts` | Imports `assembleRoot` and `readModuleFragments`; merges the scratch module's OpenAPI fragments into the real repo's root contract (read from `REPO_ROOT`). |
| `scripts/docs/module-catalogue.ts` | Imports `readCatalogue`, `renderModuleList`, `moduleSidebar`; validates that the new module appears in the rendered list and sidebar grouped correctly. |
| `scripts/docs/module-descriptor.ts` | Imports `readAllModuleDescriptors` and `frontendCounterparts`; checks descriptor discovery and the default counterpart naming. |
| `scripts/modules-on-disk.ts` | Imports `REPO_ROOT` to locate the real `openapi.root.yaml` for the assembly test. |
| `tests/support/routes.ts` | Imports `routedModulesOf`; exercises the router-guard path with a virtual (in-memory) registry rather than a disk file. |
| `tests/unit/scripts/contracts/analytics-browser-events.test.ts` | No direct import; shares the same `tests/unit/scripts` convention (scratch-tree setup, tree-reading vs. registry-reading split). |

## Notes

- The scratch tree deliberately contains **no** registry file, **no** root YAML edit, and **no** test table. The test's entire point is that none of those should be required.
- The `widgets` module ships a `probes.ts` exporting an empty array; this is the minimum to be picked up by `modulesDeclaringProbes`. A module without that file would simply be absent from client collections.
- The root-assembly test reads the **real** repo's `openapi.root.yaml` via `REPO_ROOT` but writes nothing back; it only asserts the assembled (in-memory) result contains the new paths and tags.
- The router-guard case uses a **virtual** registry (`[{ name: 'widgets', routes: router }, …]`) rather than a disk registry, matching the file's stated split: tree-reading is tested against the scratch tree, registry-reading is tested with a virtual fixture.
