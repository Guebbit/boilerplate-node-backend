---
source: scripts/docs/module-catalog.ts
source_sha256: 89cb2de16f03b801007dc140bf64050f0aee3dfa54055167013c7459989b31aa
context_sha256: 03e1c9b4035b581a007b6009271d10c62a0a0f64bcdf4caab08150151387efb9
generated_at: 2026-11-22T02:04:39.310265+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/docs/module-catalog.ts

## Purpose
Builds the module catalogue for the docs: each module's group, subdomain, summary and deeper pages, all derived from `module.yaml` descriptors and the Markdown files in the modules docs folder. It feeds both the "Every module" block of the modules start page and the `/modules/` VitePress sidebar, so a new module shows up in the right place just by declaring a `group` and a `summary`. Everything is pure except `readCatalog`, the single disk read.

## Key elements
- `CatalogEntry` / `CatalogPage`: one module (`name`, `group`, `subdomain`, `summary`, `pages`) and one deeper page (`stem`, `title`).
- `readCatalog(modulesRoot, pagesRoot)`: reads descriptors via `readAllModuleDescriptors`, lists `*.md` stems in `pagesRoot` (sorted), and attaches each page to its owning module. Page titles come from the first `# ` heading, falling back to the stem. Returns one entry per module, in descriptor order.
- `pageOwner(stem, names)`: returns the module a page belongs to. It picks the longest module name that the stem starts with as `<name>-`, and returns `undefined` if the stem is itself a module name or matches no module.
- `renderModuleList(entries)`: Markdown for the "Every module" block. Each group gets a `###` heading, a blurb and one bullet per module, with a link, the summary and a "Deeper:" list of pages.
- `moduleSidebar(entries)`: returns `SidebarSection[]`, starting with an "Overview" section and followed by one non-collapsed section per group. Each module is an item, with its deeper pages as child items.
- `SidebarItem` / `SidebarSection`: sidebar shape types.
- Internal `GROUPS` constant: fixes the presentation order (foundation, shop, example) and each group's heading and blurb. Groups with no members are skipped.

## Relationships
- `scripts/docs/module-descriptor.ts`: supplies `readAllModuleDescriptors` and the `ModuleDescriptor` type, which provides the `group`, `subdomain` and `summary` fields.
- `docs/.vitepress/config.mts`: consumes the sidebar for `/modules/`.
- `scripts/docs/generate-module-graph.ts`: a graph neighbor of this file. The visible code shows no direct interaction.
- `tests/unit/scripts/docs/module-catalog.test.ts`: tests the pure functions with a virtual module list.
- `tests/unit/scripts/modules/new-module-needs-nothing.test.ts`: a graph neighbor, presumably checking that a new module needs no manual registration. The visible code does not show how.

## Notes
- The `example` group has no page of its own. Its links point to the "the module template" section of the understand-section modules page, via a relative `../` path in the bullet list and as an absolute `/understand/modules#the-module-template` path in the sidebar.
- `pageOwner` uses the longest-name match so `shop-tasks-notices` goes to `shop-tasks`, not `shop`. A stem equal to a module name, such as `api-keys`, is never treated as a deeper page of a shorter module like `api`.
- Entries from `readCatalog` are not sorted. Alphabetical order is applied per group at render time, by `inGroup`.
- A missing `pagesRoot` is tolerated, and the module then has no deeper pages.
