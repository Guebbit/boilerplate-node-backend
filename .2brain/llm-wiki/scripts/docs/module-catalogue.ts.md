---
source: scripts/docs/module-catalogue.ts
sha256: 4bc6191c8b8d70d24ac4ad00ef1cae9840fbeb0ada9d0a0e9a1803d045f0b732
generated_at: 2026-10-14T07:16:49.584238+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/module-catalogue.ts

## Purpose

Derives every module's documentation placement from its `module.yaml` descriptor and the Markdown pages beside it, then renders two outputs that would otherwise be hand-maintained lists: the "Every module" section of `docs/modules/index.md` and the `/modules/` sidebar in the VitePress config. A new module appears in the correct group simply by declaring its `group` and `summary`—no other registration step.

## Key elements

- **`CatalogueEntry` / `CataloguePage`** — the data shapes: a module's name, group, subdomain, summary, and its deeper pages (stem + title).
- **`GROUPS`** — ordered array (`foundation` → `shop` → `example`) with heading and blurb text used by both renderers.
- **`readCatalogue(modulesRoot, pagesRoot)`** — the only function that touches disk (plus `titleOf`). Reads all descriptors, lists `.md` stems in `pagesRoot`, attributes each stem to the owning module (prefix match, excluding stems that are themselves module names), and returns `CatalogueEntry[]`.
- **`renderModuleList(entries)`** — produces the Markdown block for `docs/modules/index.md`: one `###` section per non-empty group, one bullet per module with optional "Deeper:" links.
- **`moduleSidebar(entries)`** — produces the VitePress `SidebarSection[]` for the `/modules/` route: an "Overview" item followed by one section per non-empty group, each module as an item with nested items for its deeper pages.
- **`pageLinkOf` / `TEMPLATE_SECTION`** — the `example` group links to `theory/modules.md#the-module-template` rather than to its own page, since it has none.
- **`inGroup`** — filters entries by group and sorts alphabetically; shared by both renderers.

## Relationships

- **`scripts/docs/module-descriptor.ts`** — sole import source; provides `readAllModuleDescriptors` and the `ModuleDescriptor` type that feeds `CatalogueEntry`.
- **`docs/.vitepress/config.mts`** — consumes `moduleSidebar` to build the `/modules/` navigation.
- **`docs/modules/index.md`** — consumes `renderModuleList` output as its "Every module" section.
- **`tests/unit/scripts/docs/module-catalogue.test.ts`** — unit-tests this module's pure functions by supplying virtual entry lists (bypassing `readCatalogue`).
- **`tests/unit/scripts/modules/new-module-needs-nothing.test.ts`** — verifies that declaring a new `module.yaml` is sufficient for the module to appear in the catalogue.

## Notes

- The module is deliberately pure everywhere except `readCatalogue` (and the small `titleOf` helper), so all rendering logic is testable without the filesystem.
- Page attribution uses a `startsWith(\`${name}-\`)` check **and** excludes stems that are themselves known module names, preventing false matches (e.g. `api-keys.md` is not attributed to a hypothetical `api` module).
- Groups with zero members are silently omitted from both the Markdown list and the sidebar—no empty section is emitted.
- `GROUPS` order is the canonical presentation order; it is not alphabetical.
