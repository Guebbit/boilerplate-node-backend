---
source: scripts/docs/generate-module-graph.ts
sha256: d8900dde0c9629fbbe570878aa1aca58d264a29b3c6acf7adb6a4585786c3f1b
generated_at: 2026-11-08T02:47:58.063519+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-module-graph.ts

## Purpose

Generates Mermaid dependency diagrams and a grouped module list for the `docs/modules/` markdown pages. The whole-repo graph (index page) shows import edges only; each module page gets a neighbourhood diagram that adds domain-event edges on top. All content is derived at runtime from `dependency-cruiser` output and source-file scanning, so the diagrams stay correct as imports and subscriptions change. A `--check` flag turns the script into a CI gate that fails when the committed markdown has diverged.

## Key elements

- **`readEdges()`** — shells out to `npx depcruise` (collapsed to one node per module, `/tests/` excluded, `modules.ts` dropped) and parses the Mermaid output into a sorted `[from, to][]` list.
- **`readEventEdges()` / `readEventEdgesInFile()`** — scans every tracked `.ts` file per module (tests excluded) for `onDomainEvent(CONST, …)` calls, resolving the owner from the `@modules/…` import and the wire name from the owner's `events.ts`. Produces sorted `EventEdge[]` (owner → subscriber).
- **`renderNeighbourhood(name, edges, events)`** — builds a per-module Mermaid `flowchart LR` with solid arrows (imports) and dotted arrows (events), colouring nodes by subdomain. Returns a plain-English sentence if the module has zero neighbours.
- **`render(edges)`** — builds the whole-repo `flowchart TD` for the index page, colouring by subdomain and rendering isolated modules with a dashed grey style.
- **`nodeId(name)`** — replaces hyphens with underscores so module names are valid Mermaid identifiers.
- **`eventName(owner, constant)`** — reads the owner's `events.ts` to resolve the string literal behind an exported event constant.
- **`moduleSourceFiles(name)`** — returns all tracked `.ts` files under a module (via `git ls-files`), `module.ts` first, tests excluded.
- **`SUBDOMAIN`** — a `Record<moduleName, subdomain>` built once from `readAllModuleDescriptors`; modules with no descriptor are omitted from every diagram.
- **Marker constants** (`START`/`END`, `LIST_START`/`LIST_END`) — HTML-comment delimiters that bound the replaceable generated blocks in the markdown.
- **`checkOnly`** — set when `--check` is passed; the script diffs generated vs. committed content and calls `failScript` on mismatch.

## Relationships

- **`scripts/cli.ts`** — provides `hasFlag('check')` to detect the `--check` invocation.
- **`scripts/docs/marker-block.ts`** — provides `applyMarkerBlocks`, which splices the generated body between the HTML-comment markers in each target markdown file.
- **`scripts/docs/module-catalog.ts`** — provides `readCatalog` and `renderModuleList` for the grouped module list rendered between `LIST_START`/`LIST_END`.
- **`scripts/docs/module-descriptor.ts`** — provides `readAllModuleDescriptors` and the `ModuleDescriptor` type; the script uses the `subdomain` field for node colouring.
- **`scripts/modules-on-disk.ts`** — provides `MODULES_ROOT` and `REPO_ROOT` (aliased `ROOT`) for all path resolution.
- **`scripts/fail-script.ts`** — provides `failScript`, used to print an error and exit non-zero when `--check` detects drift.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — exercises this script's behaviour in the CI wave test suite (mutation/coverage context).

## Notes

- **Event edges are the inverse of import direction.** The subscriber *imports* the constant from the owner's barrel, so the import arrow points subscriber → owner, but the domain message travels owner → subscriber. `readEventEdges` reconstructs the correct direction.
- **`modules.ts` is always excluded from edges.** The registry imports every manifest by definition, so its edges form a star that obscures the real topology.
- **`/tests/` is excluded everywhere.** A spec importing a sibling's barrel or event constant is not a cross-module dependency.
- **Subscriptions need not be in `module.ts`.** The script scans every tracked `.ts` file in the module folder (e.g. `webhooks` keeps its subscriptions in `services/publish.ts`).
- **Missing `module.yaml` → module is absent from all diagrams** rather than mislabelled.
- **`--check` is the CI mode** (run in `complete`); without it the script writes the generated blocks in place.
- The shebang is `#!/usr/bin/env tsx`; the script is executed directly, not transpiled first.
- Uses `Array.prototype.toSorted` (Node ≥ 20); the original array is never mutated.
