---
source: tests/unit/scripts/docs/module-catalogue.test.ts
sha256: b691aa50cfd686601d0c3d799fe2d1145431c36fa9a6e37ecf21ef5ce59ed1b2
generated_at: 2026-10-15T13:27:12.109814+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/docs/module-catalogue.test.ts

## Purpose

Unit tests for the two public renderers in `scripts/docs/module-catalogue.ts` — `renderModuleList` (Markdown catalogue page) and `moduleSidebar` (VitePress sidebar config). They pin down grouping order, alphabetical listing, page-link generation, the special "example" module that links to a theory anchor instead of its own page, and the rule that empty groups or empty `items` arrays never appear in output.

## Key elements

- **`entry(over)`** — local helper that returns a `CatalogueEntry` with sensible defaults (`group: 'foundation'`, empty `pages`, auto-generated `summary`), so each test case only supplies the fields it actually asserts on.
- **`CATALOGUE`** — five-entry fixture spanning three groups (`foundation`, `shop`, `example`) with one module (`account`) that has a deeper page.
- **`describe('renderModuleList')`** — asserts group ordering (foundation → shop → example), intra-group alphabetical order, the exact Markdown bullet format (including the "Deeper:" suffix), that the example module links to `../theory/modules.md#the-module-template` rather than `./example.md`, and that a catalogue containing only one group emits no heading for the other.
- **`describe('moduleSidebar')`** — asserts the sidebar is an array of section objects starting with a hard-coded `Overview` entry, one section per group in order; that deeper pages nest under their parent module; and that a module with no pages has **no** `items` key (not `items: []`).
- **`describe('moduleSidebar for the example module')`** — confirms the example entry's link is `/theory/modules#the-module-template`, not `/modules/example`.

## Relationships

- **`scripts/docs/module-catalogue.ts`** — the module under test. This file imports `moduleSidebar`, `renderModuleList`, and the `CatalogueEntry` type from it. Every assertion in this test file is a contract on those two functions' output shape and ordering.

## Notes

- The `entry` helper uses `Partial<CatalogueEntry> & Pick<CatalogueEntry, 'name'>`, so `name` is the only required override — all other fields fall back to defaults. This keeps fixtures readable but means a test that *does* care about `group` or `pages` must pass them explicitly.
- The "example" group is treated specially by the source module: its link target is a theory anchor, not a per-module `.md` file. Both `renderModuleList` and `moduleSidebar` are tested for this, so a change to the example's link convention will break both suites.
- The "no empty `items`" assertion uses a strict `toEqual` (not `toStrictEqual` with `items: undefined`), so the source must simply **omit** the key rather than set it to `undefined` or `[]`.
