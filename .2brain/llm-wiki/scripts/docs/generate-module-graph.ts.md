---
source: scripts/docs/generate-module-graph.ts
sha256: 3cabb49e90f292f5a46e4a2b236ca03b0d325fb5dcc79d1ba6667471bea552a4
generated_at: 2026-11-14T17:32:45.820890+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-module-graph.ts

## Purpose

Generates Mermaid diagrams (a whole-repo import graph and one per-module neighbourhood diagram) plus a grouped module list into `docs/modules/index.md` and individual module pages. Import edges come from a `dependency-cruiser` run; event edges are discovered by scanning each module's source for `onDomainEvent` subscriptions. Generated blocks are written between HTML-comment markers so surrounding hand-written prose is never modified. A `--check` flag lets CI fail when the generated content has drifted.

## Key elements

- **`readEdges()`** — Invokes `npx depcruise` against `src/modules` (excluding tests, collapsing to one node per module, excluding `modules.ts`), then parses the Mermaid output into a sorted `[from, to][]` array.
- **`readEventEdges()`** — Iterates every module's tracked `.ts` files (via `moduleSourceFiles`) and collects `onDomainEvent(CONST, …)` calls, resolving the owning module from the import statement. Returns sorted `EventEdge[]` (`owner`, `subscriber`, `event`).
- **`readEventEdgesInFile(source, subscriber)`** — Single-file variant: builds an import-symbol → module-owner map, then matches `onDomainEvent` calls.
- **`eventName(owner, constant)`** — Reads the owner's `events.ts` to extract the wire-name string behind a constant (falls back to the constant name).
- **`moduleSourceFiles(name)`** — Lists all `.ts` files under a module via `git ls-files`, excluding `/tests/`, with `module.ts` first.
- **`renderNeighbourhood(name, edges, events)`** — Produces a per-module Mermaid flowchart: solid arrows for imports, dotted arrows labelled with event names for subscriptions/announcements. Returns a placeholder sentence if the module has no neighbours.
- **`render(edges)`** — Produces the whole-repo Mermaid flowchart (top-down), colouring nodes by subdomain and marking isolated modules.
- **`SUBDOMAIN` / `DESCRIPTORS`** — Module-name → subdomain label map read once from `module.yaml` files; modules without a descriptor are omitted entirely.
- **`nodeId(name)`** — Replaces `-` with `_` so Mermaid identifiers are valid.
- **Marker constants** (`START`, `END`, `LIST_START`, `LIST_END`) and **`PAGE`** — Define the block boundaries and target file for `applyMarkerBlocks`.
- **`checkOnly`** — Set via `hasFlag('check')`; when true the script compares rather than writes and calls `failScript` on divergence.

## Relationships

- **`scripts/cli.ts`** — Imports `hasFlag` to read the `--check` flag from the CLI.
- **`scripts/docs/marker-block.ts`** — Imports `applyMarkerBlocks` to replace (or check) generated content between the marker comments without touching surrounding prose.
- **`scripts/docs/module-catalog.ts`** — Imports `readCatalog` and `renderModuleList` to produce the grouped module list block on the index page.
- **`scripts/docs/module-descriptor.ts`** — Imports `readAllModuleDescriptors` and the `ModuleDescriptor` type to obtain each module's `subdomain` label (used for colouring and classDef grouping in the diagrams).
- **`scripts/fail-script.ts`** — Imports `failScript` to exit with an error message when `--check` detects divergence.
- **`scripts/modules-on-disk.ts`** — Imports `MODULES_ROOT` and `REPO_ROOT` for filesystem paths.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Exercises the `--check` path (CI wave behaviour) in a unit test.

## Notes

- `src/modules/modules.ts` (the registry) is deliberately excluded from edges: it imports every manifest by construction, which would draw a star over the real topology.
- Test files are excluded from both the dependency-cruiser sweep and the event-edge scan; a spec importing a sibling's event constant is not a subscription.
- The index page graph is **imports-only**; only the per-module neighbourhood diagrams add event (dotted) edges.
- A module with no `module.yaml` is silently absent from the graph rather than mislabelled — a forgotten descriptor is a visible gap, not a wrong colour.
- The script uses `toSorted` (immutable sort) throughout; no arrays are mutated in place.
- `git ls-files` is used (not a directory walk) so untracked or ignored files never leak into the generated output.
- Mermaid node identifiers are sanitized (`-` → `_`), but node *labels* retain the original hyphenated name for readability.
