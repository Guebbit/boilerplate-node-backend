---
source: scripts/docs/generate-module-graph.ts
sha256: 270e472df4138f2bd41c1d577e49e099e5ce4c1389ad056ccad51438cbadccf2
generated_at: 2026-10-01T12:30:11.260672+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-module-graph.ts

## Purpose

Generates two pieces of documentation from the live dependency graph: a whole-repo import graph (mermaid) and a grouped module list in `docs/modules/index.md`, plus one per-module neighbourhood diagram on each module page. It reads the real graph via `dependency-cruiser` and supplements it with domain-event edges (the return path an import graph cannot see), so the diagrams stay correct after any import or subscription change without hand-maintenance.

## Key elements

- **`SUBDOMAIN`** — `Record<moduleName, 'core' | 'supporting' | 'generic'>` built at load time by reading each module's `module.yaml#subdomain`. Modules lacking a descriptor are omitted entirely.
- **`readEdges()`** — Spawns `depcruise` (via `execFileSync`), parses its collapsed mermaid output into a sorted `[from, to][]` list. Excludes `/tests/` and drops all edges touching `modules.ts` (the registry).
- **`readEventEdges()` / `readEventEdgesInFile()`** — Scans every tracked `.ts` file per module for `onDomainEvent(CONST, …)` calls, resolves the constant's import origin to name the event owner, and returns sorted `EventEdge[]` (owner → subscriber + event name).
- **`moduleSourceFiles()`** — Returns all tracked `.ts` files in a module (via `git ls-files`), `module.ts` first, tests excluded.
- **`eventName()`** — Reads the owner's `events.ts` to resolve a constant to its wire-name string.
- **`renderNeighbourhood()`** — Emits a single-module mermaid flowchart (solid arrows = imports, dotted arrows = events, colour-coded by subdomain). Returns a plain-text "no neighbours" sentence if the module is isolated.
- **`render()`** — Emits the whole-repo mermaid flowchart with all modules, edges, and subdomain colour classes.
- **`nodeId()`** — Replaces hyphens with underscores so module names become valid mermaid identifiers.
- **`--check` flag** — When present, the script fails if the generated blocks in the markdown pages have diverged from what it would now produce (run in the `complete` CI job).
- **Marker constants** (`START`/`END`, `LIST_START`/`LIST_END`) — HTML comment delimiters that bound the replaceable regions in `index.md` and each module page.

## Relationships

- **`scripts/docs/marker-block.ts`** — Provides `applyMarkerBlocks`, which writes the rendered graph/list bodies into the bounded marker regions in the target markdown files. This script is the sole caller in the docs pipeline.
- **`scripts/docs/module-catalogue.ts`** — Provides `readCatalogue` and `renderModuleList`; this script uses them to produce the grouped module list block that sits between `LIST_START`/`LIST_END` on `index.md`.
- **`scripts/docs/module-descriptor.ts`** — Provides `readModuleDescriptor`; this script calls it for every module folder to obtain the `subdomain` value that drives colour-casing and grouping.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Unit test that exercises this script's CI wave/mutation behaviour (listed as a graph neighbour; exercises the script's check/edge-reading logic).

## Notes

- Three deliberate narrowings are baked in and documented in the header: `--exclude /tests/`, `--collapse` to one node per module, and dropping `modules.ts`. Changing any of them silently alters the edge count and the meaning of the diagram.
- The per-module neighbourhood diagrams include event edges; the whole-repo index map does not. This asymmetry is intentional — the index prose argues about imports only.
- `SUBDOMAIN` silently skips modules with no `module.yaml`. A new module added without a descriptor will be absent from every generated diagram rather than mislabelled.
- Event edge detection relies on a fixed call shape (`onDomainEvent(CONST, …)`) and a fixed import pattern (`import { CONST } from '@modules/<owner>'`). A module that subscribes via a re-exported alias or a different helper will be invisible to the scanner.
- The script reads `events.ts` per owner to resolve wire names; if that file is missing or the constant is not a simple `export const X = 'string'`, the constant name itself is used as the label.
