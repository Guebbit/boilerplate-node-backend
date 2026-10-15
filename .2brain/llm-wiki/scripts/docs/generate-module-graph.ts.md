---
source: scripts/docs/generate-module-graph.ts
sha256: 074ac94358dbad8db12c4626f53d8db71cd6bb4e83e492efe3448e72aedbcadf
generated_at: 2026-10-15T09:40:30.948721+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-module-graph.ts

## Purpose

Generates the whole-repo dependency graph and the grouped module list in `docs/modules/index.md`, plus a per-module neighbourhood diagram on each module page. Rather than hand-drawing a static diagram, it shells out to `dependency-cruiser` for the real import graph and scans source files for `onDomainEvent` subscriptions to add event edges. The generated blocks are written between HTML-comment markers in the Markdown pages; `--check` mode fails when the on-disk content has diverged from what the script would produce.

## Key elements

- **`readEdges()`** — Runs `npx depcruise` (collapsed to one node per module, tests excluded, `modules.ts` excluded) and parses the mermaid output into sorted `[from, to]` import edges.
- **`readEventEdges()`** — Walks every module's source files (via `moduleSourceFiles`) calling `readEventEdgesInFile`; returns sorted `EventEdge[]` (`owner`, `subscriber`, `event`).
- **`readEventEdgesInFile(source, subscriber)`** — Regex-extracts `onDomainEvent(CONST, …)` calls, resolves each constant's owner from the `@modules/…` import, skips self-subscriptions.
- **`moduleSourceFiles(moduleName)`** — Lists a module's tracked `.ts` files (tests excluded) via `git ls-files`, placing `module.ts` first.
- **`eventName(owner, constant)`** — Reads the owner's `events.ts` to resolve a constant to its wire-name string.
- **`render(edges)`** — Builds the whole-repo mermaid flowchart for `index.md`, colouring nodes by subdomain and marking isolated modules.
- **`renderNeighbourhood(name, edges, events)`** — Builds a single-module mermaid diagram (solid arrows = imports, dotted = events) for that module's page.
- **`nodeId(name)`** — Replaces `-` with `_` so hyphenated module names become valid mermaid identifiers.
- **`DESCRIPTORS` / `SUBDOMAIN`** — Map from `readAllModuleDescriptors`; provides the subdomain label used for node colouring. Modules lacking a descriptor are omitted rather than guessed.
- **Marker constants** (`START`, `END`, `LIST_START`, `LIST_END`) — The HTML-comment delimiters that bound the generated regions in target pages.
- **`--check` flag** — Dry-run mode; compares generated output against what's already between the markers and exits non-zero on mismatch (used by the `complete` CI gate).

## Relationships

- **`scripts/docs/marker-block.ts`** — Imports `applyMarkerBlocks`, the utility that splices generated content into the pages between the marker comments.
- **`scripts/docs/module-catalogue.ts`** — Imports `readCatalogue` and `renderModuleList` to produce the grouped module-list block on `index.md`.
- **`scripts/docs/module-descriptor.ts`** — Imports `readAllModuleDescriptors` and the `ModuleDescriptor` type to obtain each module's `subdomain` label for colour coding.
- **`scripts/modules-on-disk.ts`** — Imports `MODULES_ROOT` and `REPO_ROOT` path constants used to resolve file paths throughout the script.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Exercises the `--check` divergence-detection path (mutation testing for the generated-block guard).

## Notes

- The script shells out (`execFileSync`) to `npx depcruise` and `git ls-files`; it is not a pure in-process computation and depends on the repo being in a clean, checked-out state.
- `src/modules.ts` (the registry) is deliberately excluded from edges — it imports every manifest by definition, which would draw a star-shaped graph and obscure the real topology.
- Test files are excluded in two places: the `depcruise --exclude /tests/` flag and a `/tests/` filter in `moduleSourceFiles`. A spec importing a sibling's event constant to fire a fixture is not a real subscription.
- Event edges are the reverse of the import direction: the subscriber imports the constant (import arrow points to the owner), but the message travels owner → subscriber. The script renders them as dotted arrows in the correct message direction.
- A module folder with no `module.yaml` is silently absent from the graph rather than mislabelled — a missing descriptor is a visible gap, not a silent misclassification.
