---
source: src/modules/shop-tasks/domain/index.ts
source_sha256: ce67a1ee97fa09d0aacaa565be593a7ab6feae902ac8b5b11ca43d7fc1282582
context_sha256: dae541df6f9b74b25005392a0763d1673604a647328dc976db87a27dcd31c674
generated_at: 2026-11-22T07:40:51.969041+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/domain/index.ts

## Purpose
Barrel file for the shop-tasks domain layer. It defines the public surface of the folder, which models what each shop situation opens as pure data. Its module doc states the layer is lint-guaranteed to be free of Express, Mongoose and every tier. The module doc also references a domain-layer document, section `_1-the-folder`, for background.

## Key elements
- `export * from './openings'`: re-exports everything from the sibling `./openings` module. This is the file's only code.

## Relationships
- `./openings` (`src/modules/shop-tasks/domain/openings.ts`): the sole source of the re-exported symbols.
- `src/modules/shop-tasks/index.ts`: a neighbor in the dependency graph. It is the module-level entry point and is related to this barrel through the graph.

## Notes
- Because of the wildcard re-export, new exports added to `./openings` become part of this domain barrel automatically.
- The "no Express, Mongoose or tier imports" rule is enforced by lint, according to the module doc. Anything exported here is expected to respect that.
