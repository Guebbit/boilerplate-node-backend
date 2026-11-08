---
source: scripts/docs/module-catalog.ts
sha256: 15cc6228f10c0b25b62014051a85a25f1c24e275e833cc7f46c1799964ff3d9d
generated_at: 2026-11-08T02:49:23.629378+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/module-catalog.ts

## Purpose

Derives a module catalogue—grouped list of modules with their deeper pages—from the `module.yaml` descriptors and the Markdown files beside them. Produces two outputs that would otherwise be hand-maintained: the "Every module" Markdown block for `docs/modules/index.md` and the `/modules/` sidebar structure for VitePress. A new module appears in the correct group and position simply by declaring its `group` and `summary` in its descriptor.

## Key elements

- **`CatalogEntry` / `CatalogPage`** — the data shape: one module with name, group, subdomain, summary, and its deeper pages (stem + sidebar title).
- **`GROUPS`** — ordered array of the three group definitions (`foundation`, `shop`, `example`) with heading text and blurb; controls section order and content in both outputs.
- **`readCatalog(modulesRoot, pagesRoot)`** — the single disk-reading function. Reads all descriptors via `readAllModuleDescriptors`, scans the pages directory for `.md` files, and attaches each page to the module whose name is a prefix of the stem (excluding stems that are themselves module names). Returns entries in descriptor order.
- **`renderModuleList(entries)`** — pure; emits the Markdown bullet-list block (one `###` section per non-empty group, one bullet per module with optional "Deeper:" links).
- **`moduleSidebar(entries)`** — pure; emits a `SidebarSection[]` array (VitePress-compatible) with an Overview entry, then one section per group containing module items and nested page items.
- **`pageLinkOf` / `titleOf`** — small helpers. `pageLinkOf` redirects the `example` group to the theory-page section; `titleOf` extracts the first `# ` heading from a page file, falling back to the stem.
- **`SidebarItem` / `SidebarSection`** — exported interfaces describing the VitePress sidebar shape.

## Relationships

- **`scripts/docs/module-descriptor.ts`** — imports `readAllModuleDescriptors` and the `ModuleDescriptor` type; all group/subdomain/summary data originates there.
- **`docs/.vitepress/config.mts`** — consumer of `moduleSidebar` output (the `/modules/` sidebar array).
- **`docs/modules/index.md`** — consumer of `renderModuleList` output (the "Every module" section).
- **`tests/unit/scripts/docs/module-catalog.test.ts`** — unit-tests the pure functions by supplying a virtual entry list; exercises `readCatalog` with a fixture directory.
- **`tests/unit/scripts/modules/new-module-needs-nothing.test.ts`** — verifies that adding a new module descriptor requires no changes to this file (i.e., the catalogue adapts automatically).

## Notes

- **`readCatalog` is the only impure function.** Everything downstream (`renderModuleList`, `moduleSidebar`, `bullet`, `inGroup`) is a pure transform on `CatalogEntry[]`, which is what makes the rest trivially testable without disk I/O.
- **The `example` group is special-cased** in both `pageLinkOf` and `moduleSidebar`: it links to `theory/modules.md#the-module-template` rather than to a `docs/modules/example.md` page, because that module has no dedicated page.
- **Page attribution rule:** a file `X-topic.md` in `docs/modules/` is attributed to module `X` only if `X-topic` is *not* itself a module name. This prevents e.g. `api-keys.md` from being swallowed by a hypothetical `api` module.
- **Group order is fixed** (`foundation` → `shop` → `example`) by the `GROUPS` constant, not by the descriptor's order. Adding a new group value to `module.yaml` without adding it to `GROUPS` will silently drop that module from both outputs.
