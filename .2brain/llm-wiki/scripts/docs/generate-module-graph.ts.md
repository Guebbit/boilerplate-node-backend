---
source: scripts/docs/generate-module-graph.ts
sha256: dcf75d0caf06de0870255e0dc8f21948b9e2e5c17899280e894e551b0aad9de7
generated_at: 2026-09-23T17:25:34.570163+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-module-graph.ts

## Purpose

Generates Mermaid diagrams—the whole-repo module graph in `docs/modules/index.md` and one neighbourhood diagram per module page—from the actual dependency graph (via `dependency-cruiser`) and cross-module domain-event subscriptions. Generated rather than hand-drawn so the published graph can't quietly drift after an import change.

## Key elements

- **`SUBDOMAIN`** — `Readonly<Record<string, 'core'|'supporting'|'generic'>>`, built at module-load time by reading each folder's `module.yaml` via `readModuleDescriptor`. Folders lacking a descriptor are omitted, not guessed.
- **`readEdges()`** — Shells out to `depcruise` (collapsed to one node per module, `--exclude /tests/`) and parses the Mermaid output into `[from, to][]` pairs. Filters out `modules.ts` (the registry).
- **`readEventEdges()`** — Scans each module's `module.ts` for `onDomainEvent(CONST, …)` calls, resolves the constant's import origin to find the owner, and returns `EventEdge[]` (owner → subscriber with the wire event name).
- **`eventName(owner, constant)`** — Reads the owner's `events.ts` to resolve a constant to its string wire name.
- **`render(edges)`** — Produces the whole-repo Mermaid flowchart (TD) plus a summary table (reaches / reached-by per module) for the index page.
- **`renderNeighbourhood(name, edges, events)`** — Produces a per-module Mermaid flowchart (LR) with solid arrows for imports and dotted arrows for events. Returns a placeholder sentence if the module has no neighbours.
- **`applyTarget(target)`** — Writes the generated block between the `<!-- module-graph:start/end -->` markers in the target file, or exits non-zero in `--check` mode if the content has drifted.
- **`nodeId(name)`** — Sanitises module names (e.g. `audit-logs` → `audit_logs`) into valid Mermaid identifiers.
- **Constants** — `ROOT`, `MODULES_ROOT`, `PAGE`, `START`, `END` fix the filesystem layout the script assumes.

## Relationships

- **`scripts/docs/module-descriptor.ts`** — Imported for `readModuleDescriptor`, which parses `module.yaml` to supply each module's `subdomain` value (used for colour classes in both the index diagram and neighbourhood diagrams).

## Notes

- `--check` (used in the `complete` pipeline) makes the script fail if the generated block no longer matches what the current dependency graph + event subscriptions would produce. The hand-written prose outside the markers is never modified.
- `src/modules.ts` (the registry) is deliberately excluded: its thirteen import edges are a structural fact, not a domain relationship, and would draw a star over the real shape.
- `--exclude /tests/` is critical: without it the sweep reports ~38 edges (test-suite cross-imports) instead of the ~19 real architectural edges.
- Event edges are the "return path" an import graph cannot see: the subscriber imports the event constant from the owner's barrel, so the import arrow points at the owner while the message travels the other way. `readEventEdges` inverts this.
- A module with no `module.yaml` is silently absent from every diagram—there is no fallback colour.
