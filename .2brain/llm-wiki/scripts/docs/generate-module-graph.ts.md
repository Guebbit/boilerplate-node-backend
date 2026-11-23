---
source: scripts/docs/generate-module-graph.ts
source_sha256: 0e938850cb1f12bc86b424e3a2dfa5a89cc66803e3d141b4634428c01d10fbd1
context_sha256: 5e4df154aced267851561b7bb3d225577b6b9d10be98e3e3281d839f3c5f70bc
generated_at: 2026-11-22T02:03:29.818767+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/docs/generate-module-graph.ts

## Purpose
A `tsx` script that generates the module dependency graph and the grouped module list on the modules index docs page, plus a per-module "neighbourhood" diagram on each module page. It reads the real import graph from `dependency-cruiser` (and domain-event subscriptions from source) so the diagrams can't silently drift from the code. With `--check` it only verifies that the generated blocks are up to date instead of rewriting them.

## Key elements
- `checkOnly` — `hasFlag('check')`; verify-only mode.
- `PAGE`, `START`/`END`, `LIST_START`/`LIST_END` — the index page and the HTML-comment markers (`<!-- module-graph:start -->`, `<!-- module-list:start -->`, etc.) bounding the generated blocks. Only content between markers is replaced.
- `EventEdge` — `{ owner, subscriber, event }` for one cross-module domain event.
- `Target` — `{ file, start, end, body }`: a generated block and the page it belongs in, resolved before anything is written.
- `DESCRIPTORS` / `SUBDOMAIN` — module descriptors read from `module.yaml`; `SUBDOMAIN` maps module name to its subdomain and is used for colouring and as the module list. Modules without a descriptor are omitted.
- `readEdges()` — runs `npx depcruise src/modules` (excluding `/tests/`, collapsed to one node per module, mermaid output, `.dependency-cruiser.cjs`), parses the mermaid into sorted module→module edges, and drops `modules.ts` (the registry).
- `nodeId()` — turns names into Mermaid-safe ids (`-` → `_`).
- `eventName()` — resolves an event constant to its wire-name string from the owner's `events.ts`, falling back to the constant name.
- `moduleSourceFiles()` — tracked `.ts` files of a module via `git ls-files`, excluding `/tests/`, with `module.ts` first.
- `readEventEdgesInFile()` — regex-finds `onDomainEvent(CONST` calls, resolves the owner from `@modules/<owner>` imports, and skips self-subscriptions.
- `readEventEdges()` — collects event edges across all modules' files, sorted.
- `renderNeighbourhood()` — per-module Mermaid `flowchart LR`: solid arrows for imports, dotted labelled arrows for events, colour classes by subdomain, the module itself highlighted. Isolated modules get a one-sentence note instead of a diagram.
- `render()` — whole-repo `flowchart TD` of import edges only, with connected modules grouped by subdomain and isolated ones listed separately (the rest of the file is not shown here).

## Relationships
- `scripts/docs/module-descriptor.ts` — supplies `readAllModuleDescriptors` and `ModuleDescriptor` (the subdomain labels).
- `scripts/docs/marker-block.ts` — supplies `applyMarkerBlocks`, used to write or check the marker-bounded blocks.
- `scripts/docs/module-catalog.ts` — supplies `readCatalog` and `renderModuleList` for the grouped module list.
- `scripts/modules-on-disk.ts` — supplies `MODULES_ROOT` and `REPO_ROOT`.
- `scripts/cli.ts` — supplies `hasFlag`.
- `scripts/fail-script.ts` — supplies `failScript` for error exits.
- `tests/unit/scripts/mutation/ci/waves.test.ts` — listed as a graph neighbour; the visible portion of this file shows no direct interaction with it.

## Notes
- The index map is deliberately imports-only; event edges appear only on per-module pages, since they are the return path an import graph can't see.
- Event detection relies on a fixed shape: `onDomainEvent(CONST, …)` with `CONST` imported by name from `@modules/<owner>`. Subscriptions may live in any of a module's files (e.g. the webhooks module's in `src/modules/webhooks/services/publish.ts`), not just `module.ts`.
- Tests are excluded from both the import sweep and the event scan, so specs don't inflate the graph.
- Requires `npx`/`depcruise` and `git` to be available at run time; `--check` is run as part of `complete`.
- A stray doc comment ("Every module folder under `src/modules`.") precedes `PAGE` without a declaration; it is leftover and does not document `PAGE`.
