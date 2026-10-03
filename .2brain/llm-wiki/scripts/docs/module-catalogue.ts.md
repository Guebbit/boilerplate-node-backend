---
source: scripts/docs/module-catalogue.ts
sha256: d6575dc4c7c0d208bb4bc4145a32d970b70b0763a261a82ed5f2361cde4be58c
generated_at: 2026-10-01T12:30:50.862013+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/module-catalogue.ts

## Purpose

Derives a single catalogue of all modules (group, summary, deeper pages) from `module.yaml` descriptors and the Markdown files beside them, then renders that catalogue into the two places that used to be hand-kept lists: the "Every module" block in `docs/modules/index.md` and the `/modules/` sidebar in the VitePress config. Adding a module to the docs requires only declaring its group and summary in its own descriptor.

## Key elements

- **`GROUPS`** – Ordered list of the two groups (`foundation`, `shop`) with their display heading and blurb. Fixed order; adding a group means editing this constant.
- **`readCatalogue(modulesRoot, pagesRoot)`** – The sole disk-reading function. Reads descriptors via `readAllModuleDescriptors`, lists `.md` files in the pages root, and returns `CatalogueEntry[]` (alphabetical). A page stem is attributed to module `m` iff it starts with `m-` **and** is not itself a module name.
- **`renderModuleList(entries)`** – Pure. Produces the Markdown for the "Every module" section: one `###` heading per non-empty group, a blurb, then a bullet per module (link + summary + optional "Deeper:" links).
- **`moduleSidebar(entries)`** – Pure. Returns `SidebarSection[]` shaped for VitePress: an "Overview" entry, then one section per non-empty group with nested items for deeper pages.
- **`CatalogueEntry` / `CataloguePage`** – The data shapes threaded through all renderers.
- **`SidebarItem` / `SidebarSection`** – VitePress sidebar node types.
- **`titleOf`** (internal) – Extracts the first `# ` heading from a Markdown file; falls back to the file stem.

## Relationships

- **`scripts/docs/module-descriptor.ts`** – Imports `readAllModuleDescriptors` and the `ModuleDescriptor` type; all group/subdomain/summary data flows from there.
- **`docs/.vitepress/config.mts`** – Consumes the output of `moduleSidebar()` to build the `/modules/` sidebar.
- **`tests/unit/scripts/docs/module-catalogue.test.ts`** – Unit-tests this module's pure functions with a virtual module list (no disk).
- **`tests/unit/scripts/modules/new-module-needs-nothing.test.ts`** – Verifies that a freshly added module appears in the catalogue with zero extra wiring.

## Notes

- **Only one function touches disk** (`readCatalogue`). Everything downstream is pure, so tests drive the renderers with in-memory arrays.
- **Page attribution guard:** `api-keys.md` is *not* a deeper page of module `api`; the `names` set check in `readCatalogue` excludes any stem that is itself a module. Forgetting this would mis-attach `api-keys` under `api`.
- **`GROUPS` is a closed list.** A third group requires a code change here; the renderers iterate over it, so no group can be added via config alone.
- Uses **`.toSorted()`** (ES 2023 / Node 20+) rather than mutating `.sort()`.
