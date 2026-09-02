# scripts/generate-module-graph.ts

## Purpose

Generates the module dependency diagram in `docs/modules/index.md` and a per-module neighbourhood diagram on each module's page, replacing hand-drawn mermaid blocks with graphs derived from actual `dependency-cruiser` output and `onDomainEvent` subscriptions. It exists so the published architecture diagram can never silently drift from the code: run with `--check` (as part of `complete`) it fails when the generated blocks no longer match reality.

## Key elements

- **`SUBDOMAIN`** — `Record<string, 'core' | 'supporting' | 'generic'>` mapping each of the 13 modules to its DDD subdomain; drives node colouring in both diagrams.
- **`readEdges()`** — shells out to `npx depcruise` with `--collapse` to one node per module, `--exclude /tests/`, and mermaid output; parses the result into a sorted `[from, to]` edge list. Filters out `modules.ts` (the registry) as a node.
- **`readEventEdges()`** — scans each module's `module.ts` for `onDomainEvent(CONST, …)` calls, resolves the owning module via barrel imports, and resolves the wire event name via `eventName()`. Returns `EventEdge[]` (owner → subscriber with event name).
- **`render(edges)`** — produces the full index-page block: a top-down mermaid flowchart plus a "Reaches / Reached by" table sorted by degree.
- **`renderNeighbourhood(name, edges, events)`** — produces a single-module left-right mermaid diagram with solid arrows (imports) and dotted arrows (events). Returns a prose placeholder when the module has zero neighbours.
- **`applyTarget(target)`** — splices a generated block between the `<!-- module-graph:start/end -->` markers in a page file, formats the whole file with Prettier, then either writes it back or reports drift (in `--check` mode).
- **`nodeId(name)`** — replaces hyphens with underscores so module names like `audit-logs` are valid mermaid identifiers.
- **`eventName(owner, constant)`** — reads `src/modules/<owner>/events.ts` to map a TS constant back to its string wire name.
- **`checkOnly`** — set when `--check` is in `process.argv`; causes `applyTarget` to report drift and exit 1 instead of writing.

## Relationships

No graph-neighbor files are recorded. The script is a leaf: it imports only Node built-ins (`child_process`, `fs`, `path`) and `prettier`, and invokes `depcruise` as a subprocess. Its output is consumed by the static markdown pages under `docs/modules/`.

## Notes

- The generated block is always run through Prettier *before* comparison or write, because `prettier --check` also covers `docs/` in the `complete` gate; skipping this step makes the two checks demand different bytes from the same file.
- `src/modules.ts` is deliberately excluded from the graph: it imports every manifest by definition, so its 13 edges would draw a star over the real topology.
- Test files (`/tests/`) are excluded so the diagram describes the architecture rather than the test suite (19 real edges vs. 38 with tests included).
- Event edges are the *reverse* of the import direction: a subscriber imports the event constant from the owner's barrel, so the import points at the owner while the message flows owner → subscriber. `readEventEdges` corrects this.
- A module listening to its own events is skipped (local concern, not a cross-module edge).
- The index diagram is imports-only; only the per-module neighbourhood diagrams add dotted event arrows.
