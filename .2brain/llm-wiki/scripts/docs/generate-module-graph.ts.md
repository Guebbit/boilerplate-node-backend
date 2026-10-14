---
source: scripts/docs/generate-module-graph.ts
sha256: 63de3fa8728086fa22e11a93f9e5c470ca1cc570175020456b4846e3efac47e3
generated_at: 2026-10-14T07:15:47.934077+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-module-graph.ts

## Purpose

Generates two Mermaid diagrams and a grouped module list into `docs/modules/index.md`, plus a per-module neighbourhood diagram into each module's own page. It shells out to `dependency-cruiser` for the real import graph (rather than hand-drawing one that goes stale) and separately scans source files for `onDomainEvent` subscriptions, which are edges an import graph cannot see. A `--check` flag re-renders and compares against what is already in the pages, failing CI (`complete`) on divergence.

## Key elements

- **`readEdges()`** — runs `npx depcruise` with `--collapse` (one node per module), `--exclude /tests/`, and filters out `modules.ts` (the registry). Returns a sorted `[from, to][]` list.
- **`readEventEdges()`** — iterates every known subscriber module, reads all its source files via `moduleSourceFiles`, and collects cross-module `onDomainEvent(CONST, …)` calls. Returns sorted `EventEdge[]` (owner, subscriber, event name).
- **`readEventEdgesInFile(source, subscriber)`** — parses one file: maps imported symbols to their `@modules/<owner>` barrel, then matches `onDomainEvent` calls. Skips self-subscriptions.
- **`moduleSourceFiles(moduleName)`** — lists tracked `.ts` files under a module (excluding `/tests/`), with `module.ts` placed first for a fast common-case hit.
- **`eventName(owner, constant)`** — reads the owner's `events.ts` to resolve the wire string behind an exported constant.
- **`renderNeighbourhood(name, edges, events)`** — builds the per-module Mermaid flowchart: solid arrows for imports, dotted arrows for events, colour-coded by subdomain. Returns a placeholder sentence if the module has zero neighbours.
- **`render(edges)`** — builds the whole-repo Mermaid flowchart (top-down) with subdomain colour classes and an isolated-node group.
- **`nodeId(name)`** — replaces `-` with `_` so module names are valid Mermaid identifiers.
- **`SUBDOMAIN`** (const) — maps each module folder name to its `module.yaml#subdomain` value (`core` | `supporting` | `generic`); folders missing a descriptor are omitted.
- **Marker constants** (`START`/`END`, `LIST_START`/`LIST_END`) — HTML-comment delimiters that bound the generated block in each Markdown page.
- **`checkOnly`** — set when `--check` is in `argv`; the script compares rather than writes.

## Relationships

- **`scripts/docs/marker-block.ts`** — provides `applyMarkerBlocks`, which replaces the content between the start/end markers in a target `.md` file with the freshly rendered body (or reports divergence in `--check` mode).
- **`scripts/docs/module-catalogue.ts`** — provides `readCatalogue` and `renderModuleList`, used to generate the grouped module list block on the index page.
- **`scripts/docs/module-descriptor.ts`** — provides `readModuleDescriptor`, called once per module folder to read its `module.yaml` and extract the `subdomain` field used for colouring.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — a test in the dependency graph that exercises this script's behaviour (presumably the `--check` path or edge-extraction logic) as part of CI wave testing.

## Notes

- **`--check` is the CI gate.** The prose around each generated block is hand-written; `--check` (run in `complete`) fails if the rendered output no longer matches what sits between the markers, catching stale docs.
- **`modules.ts` is deliberately excluded.** The registry imports every manifest by definition, so its 13 edges would form a star that obscures the actual domain-to-domain shape.
- **Test files are excluded** (`--exclude /tests/` in depcruise, `/tests/` filter in `moduleSourceFiles`). Without this, the sweep reports 38 edges instead of 19 and describes the test suite rather than the architecture.
- **A module without `module.yaml` is silently omitted** from the graph rather than guessed at — a forgotten descriptor shows up as a missing node.
- **Event subscriptions can live anywhere in the module.** The script scans all tracked source files, not just `module.ts` (e.g., webhooks' subscriptions are in `services/publish.ts`).
- **Self-subscriptions are filtered out** in `readEventEdgesInFile` — a module listening to its own event is a local concern, not a cross-module edge.
