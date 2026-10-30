---
source: scripts/docs/generate-module-graph.ts
sha256: c73ef189ff71c8b500418e17b4d90450ad2bb6322636ce955d4eaeec02c99c68
generated_at: 2026-10-29T01:34:51.124322+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-module-graph.ts

## Purpose

Generates two kinds of Mermaid diagrams—(1) the whole-repo import graph on `docs/modules/index.md` and (2) a per-module neighbourhood diagram on each module's page—plus the grouped module list. It reads the real dependency graph from `dependency-cruiser` and traces `onDomainEvent` subscriptions from source, rather than relying on a hand-drawn diagram that would silently rot after the next import. Supports a `--check` mode (run in CI via `complete`) that fails when generated content has diverged from what is on disk.

## Key elements

- **`readEdges()`** — Shells out to `depcruise` with `--collapse` and `--exclude /tests/`, parses the Mermaid output into `[from, to]` pairs; drops `modules.ts` (the registry) edges.
- **`readEventEdges()` / `readEventEdgesInFile()`** — Scans every `.ts` file a module owns (tests excluded) for `onDomainEvent(CONST, …)` calls, resolves the owner from the import, and records `{owner, subscriber, event}` triples.
- **`moduleSourceFiles(moduleName)`** — Lists a module's tracked `.ts` files (excluding `/tests/`), with `module.ts` first to hit the common subscription site in one read.
- **`eventName(owner, constant)`** — Reads the owner's `events.ts` to map an exported constant to its wire-name string; falls back to the constant name.
- **`render(edges)`** — Produces the whole-repo Mermaid `flowchart TD` (import edges only), colouring nodes by subdomain and isolating unconnected modules.
- **`renderNeighbourhood(name, edges, events)`** — Produces a per-module `flowchart LR` with solid arrows (imports) and dotted arrows (events), coloured by subdomain.
- **`nodeId(name)`** — Replaces `-` with `_` so module names are valid Mermaid identifiers.
- **Marker constants** (`START`/`END`, `LIST_START`/`LIST_END`) — HTML comments that bound the generated block; only content between them is replaced.
- **`Target` / `EventEdge`** — Interfaces for a resolved write target and a single event edge.

## Relationships

- **`scripts/docs/module-descriptor.ts`** — Provides `readAllModuleDescriptors` and the `ModuleDescriptor` type; this script reads each module's `subdomain` to colour diagram nodes. Folders missing a descriptor are omitted entirely.
- **`scripts/docs/marker-block.ts`** — Provides `applyMarkerBlocks`, which writes the generated block between the HTML-comment markers in the target page without touching surrounding prose.
- **`scripts/docs/module-catalogue.ts`** — Provides `readCatalogue` and `renderModuleList` for the grouped module list block on `index.md`.
- **`scripts/modules-on-disk.ts`** — Supplies `MODULES_ROOT` and `REPO_ROOT` path constants used throughout.
- **`scripts/cli.ts`** — Supplies `hasFlag` to detect the `--check` flag.
- **`scripts/fail-script.ts`** — Supplies `failScript` for structured error output when checks fail.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Mutation/CI test that exercises the `--check` path (verifying divergence is detected).

## Notes

- The registry file `src/modules.ts` is deliberately excluded from edges: it imports every manifest by definition, so including it would draw a star over the true topology.
- Event edges are the **return path** an import graph cannot see: the subscriber imports the owner's constant, so the static import points at the owner while the message travels the other direction. `readEventEdges` reconstructs the true direction.
- A module whose subscriptions live outside `module.ts` (e.g. `services/publish.ts` in `webhooks`) is still captured because `moduleSourceFiles` walks all tracked files, not just the manifest.
- `--check` compares the on-disk block against what would be generated; it does **not** write. This is the guard that runs in CI.
- The whole-repo index map is imports-only by design; the prose around it argues about import topology. Event edges appear only in per-module neighbourhoods.
- Modules with no `module.yaml` are silently absent from both diagrams rather than rendered with a guessed label.
