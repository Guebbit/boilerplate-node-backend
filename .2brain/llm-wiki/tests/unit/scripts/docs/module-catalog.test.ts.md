---
source: tests/unit/scripts/docs/module-catalog.test.ts
sha256: 9600b4db872f3790ecd450a852a0e8bb99be3a5bd78a6916116385de2e1db7dd
generated_at: 2026-11-08T10:35:58.017877+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/docs/module-catalog.test.ts

## Purpose

Unit tests for the two public functions in `scripts/docs/module-catalog.ts` (`renderModuleList` and `moduleSidebar`). They verify that the generated documentation navigation—both the Markdown module list and the sidebar JSON—respects group ordering, alphabetical listing, per-module summaries, nested page links, and the special "example" module that links to a theory section rather than its own page.

## Key elements

- **`entry(over)`** – Local helper that fills a `CatalogEntry` with default values (`group: 'foundation'`, `subdomain: 'generic'`, a generic summary, empty `pages`) so each test fixture only specifies what it cares about.
- **`CATALOGUE`** – Five-entry fixture spanning three groups (`foundation`, `shop`, `example`), including one module (`account`) with a deeper page (`account-sessions`) and the special `example` entry.
- **`describe('renderModuleList')`** – Four tests covering: group ordering (foundation → demo shop → example), alphabetical module order within a group with summary + deeper-page rendering, the example module's link to `../theory/modules.md#the-module-template` (and absence of `./example.md`), and omission of a group heading when all its modules are filtered out.
- **`describe('moduleSidebar')`** – Three tests covering: top-level order (Overview, then one section per group), nesting of a module's deeper pages as `items`, and the absence of an empty `items` array for modules without sub-pages.
- **`describe('moduleSidebar for the example module')`** – Confirms the example entry's link is `/theory/modules#the-module-template` with no own-page link.

## Relationships

- **`scripts/docs/module-catalog.ts`** (sibling under test) – Provides `renderModuleList`, `moduleSidebar`, and the `CatalogEntry` type that this file imports and exercises. This test file is the sole consumer listed in the dependency graph.

## Notes

- The `entry` helper deliberately sets `subdomain: 'generic'` and a templated summary; tests never assert on `subdomain`, so changing that default won't break them.
- The "example" group is treated as a fixed last position and its sole entry is expected to link to an anchor in `../theory/modules.md` rather than to a page of its own—this is a domain convention baked into the assertions, not a generic rule.
- Group ordering is asserted by index comparison (`toBeLessThan` / `toBeGreaterThan`) rather than exact string matching, so inserting a new group between existing ones would break the relative-order assertions.
