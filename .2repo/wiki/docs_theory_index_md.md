# docs/theory/index.md

## Purpose

Landing page for the **Theory** documentation section. It defines the two load-bearing terms used across every theory page (*domain* and *barrel*), lists the architectural strategies the boilerplate follows, and provides a topic-to-file navigation table so readers can jump directly to the page they need without reading every theory document sequentially.

## Key elements

- **"Theory in one screen" Mermaid flowchart** — visual summary of the concept chain: Contract → Architecture → Modules → Layers → Request Flow, with Security and Signals branching off Architecture.
- **Domain definition** — four distinct senses of "domain" (business area/folder, the inner `domain/` rules folder, a domain event, and DDD "the domain"), each with a table row and a Mermaid diagram showing folder structure.
- **Barrel definition** — explains that `index.ts` is a re-export-only boundary file; sibling modules import from the barrel, not from internal files (lint-enforced).
- **"Main strategies already present in the code" list** — seven bullets covering contract-first, modular domains, layered backend, database isolation, fail-open optional infrastructure, promise-oriented style, and boilerplate-over-product-detail.
- **"Where each topic lives" navigation table** — maps reader intent (e.g. "add a domain", "follow a request") to the specific theory page or sibling section to open.

## Relationships

- **`docs/theory/layers.md`** — Referenced twice as the destination for the "Layered backend" strategy and for the "Read the folder-by-folder explanation" row in the navigation table. This index page is the conceptual entry point that `layers.md` elaborates.
- **`docs/theory/glossary.md`** — Sits in the same section; the term definitions here (domain, barrel) are the working definitions that the glossary expands upon.

## Notes

- The page deliberately uses the word "domain" in four senses within a single page and warns the reader they are *not* interchangeable. The disambiguation table near the bottom is the canonical reference; other pages assume the reader has seen it.
- "Barrel" is a local coinage for `index.ts` re-export files, not a standard industry term. If a reader searches for "barrel file" they will not find this concept elsewhere.
- The navigation table links to pages outside this directory (e.g. `../api/`, `../tools/`), so this index is also a cross-section entry point, not purely a local table of contents.
