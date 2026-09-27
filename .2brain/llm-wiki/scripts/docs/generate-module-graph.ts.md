---
source: scripts/docs/generate-module-graph.ts
sha256: 02f93a04cd2b4b7b0cec293244f5f74ce85f3cbe2e51948252811e24384b89eb
generated_at: 2026-09-27T13:55:36.232635+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-module-graph.ts

## Purpose

Generates Mermaid flowchart diagrams showing inter-module import edges and domain-event subscriptions, inserting them into `docs/modules/index.md` (whole-repo graph) and each module's own page (local neighbourhood). The graphs are derived from `dependency-cruiser` output and a static scan of `onDomainEvent` calls rather than hand-drawn, so they stay correct as the import surface changes. Running with `--check` fails if the generated blocks have diverged from the live graph; that is what the `complete` script invokes.

## Key elements

- **`SUBDOMAIN`** — `Readonly<Record<string, 'core' | 'supporting' | 'generic'>>` built at module-load time by reading each folder under `src/modules/*/module.yaml` via `readModuleDescriptor`. Modules lacking a descriptor are omitted, not guessed.
- **`readEdges()`** — Shells out to `npx depcruise` with `--collapse`, `--exclude /tests/`, and a `--include-only ^src/modules/` filter; parses the Mermaid output into `[from, to][]` pairs, dropping any edge touching `modules.ts` (the registry).
- **`nodeId(name)`** — Replaces `-` with `_` so module names are valid Mermaid identifiers.
- **`eventName(owner, constant)`** — Reads `src/modules/<owner>/events.ts` and extracts the string literal assigned to the exported constant, returning the wire name.
- **`moduleSourceFiles(moduleName)`** — Lists every tracked `.ts` file in a module (via `git ls-files`), excluding `/tests/`, with `module.ts` guaranteed first.
- **`readEventEdgesInFile(source, subscriber)`** — Regex-scans one file's `import { … } from '@modules/…'` statements and `onDomainEvent(CONST, …)` calls to produce `EventEdge[]` entries; skips self-subscriptions.
- **`readEventEdges()`** — Iterates every module in `SUBDOMAIN` × its source files, calling `readEventEdgesInFile`, and returns a sorted `EventEdge[]`.
- **`renderNeighbourhood(name, edges, events)`** — Produces the per-module Mermaid block: solid arrows for imports, dotted arrows for events, colour-coded by subdomain, with the centre node highlighted. Emits a plain-English sentence instead of a diagram when the module has zero neighbours.
- **`render(edges)`** — Produces the whole-repo Mermaid block (top-down layout) for the index page, colouring connected nodes by subdomain and isolating unconnected ones with a dashed style.
- **`applyMarkerBlocks`** (imported) — Writes each `Target` block between its `<!-- module-graph:start -->` / `<!-- module-graph:end -->` markers in the target file.
- **`checkOnly`** — When `--check` is present, the script validates instead of writing.

## Relationships

- **`scripts/docs/marker-block.ts`** — Provides `applyMarkerBlocks`, which performs the actual file I/O: locating the start/end markers in a Markdown file and replacing the content between them. This script builds the `Target` objects (file path, marker strings, body) and hands them off.
- **`scripts/docs/module-descriptor.ts`** — Provides `readModuleDescriptor`, used once at load time to read `module.yaml` and extract the `subdomain` field that drives node colouring in both diagrams.

## Notes

- Event edges are the *reverse* of the import direction: a subscriber imports the owner's constant, so the import graph shows subscriber → owner, but the event flows owner → subscriber. The script reconciles this by tracking `owner` and `subscriber` explicitly.
- `modules.ts` (the registry) is excluded from the graph because it imports every manifest by construction; including it would draw a star that obscures the real topology.
- Test files are excluded from both import-edge detection and event-edge scanning; a spec importing a sibling's event constant to fire a fixture is not a real subscription.
- The script must be run from the repo root context (it resolves `ROOT` as two levels up from `scripts/docs/`) and requires `npx depcruise` to be available.
- Per-module pages are located by module name (not a fixed path), while the index page is always `docs/modules/index.md`.
- Modules missing `module.yaml` are silently absent from the graph rather than assigned a default colour.
