# scripts/report-heap-retainers.ts

## Purpose

Answers "who is holding these?" for a single kind of heap object by building a reverse (in-degree) index over a V8 `.heapsnapshot` file and walking retainer chains upward. It exists as a separate script from `report-heap-summary.ts` because it must hold the entire edge graph in memory, whereas the summary script only needs per-node aggregates.

## Key elements

- **`readHeader()`** — Reads the first 128 KB of the snapshot, regex-parses the JSON header to extract `node_fields`, `node_types`, `edge_fields`, `edge_types`, `node_count`, and `edge_count`.
- **`streamArray(key, onChunk)`** — Streams a top-level bracketed array (e.g. `"nodes":[…]`) from the file using a hand-rolled bracket-depth scanner with string/escape awareness, yielding raw text chunks without loading the whole file.
- **`readInts(key, out)`** — Feeds `streamArray` chunks into a preallocated `Int32Array`, splitting on commas.
- **`main()`** — Orchestrates the full pipeline: reads nodes and edges into flat `Int32Array`s, builds a CSR-format reverse index (`retainer`, `retainerEdge`, `returnValueStart`), resolves the target kind by streaming the `strings` array, walks up to `depth` retainer levels per target (preferring a retainer whose type differs from the target's), aggregates chains, and prints the top 20 ranked by retained bytes.
- **CLI args** — `tsx scripts/report-heap-retainers.ts <file.heapsnapshot> [kind] [depth]`; defaults: `kind = 'JSArrayBufferData'`, `depth = 3`.

## Relationships

- **`scripts/report-heap-summary.ts`** — Documented workflow partner: run the summary first to identify the dominant object kind, then pass that kind here. The two scripts are deliberately split because their memory profiles differ (this one needs the full edge graph resident).
- **`docs/tools/mutation-testing.md`** — The `#finding-the-culprit` section is referenced in the file's doc comment as further reading.

## Notes

- Expect `NODE_OPTIONS=--max-old-space-size=10240` (or higher) for large snapshots; the entire node and edge arrays are materialised as `Int32Array`s before any work begins.
- At each retainer step the script picks *a* retainer, not the *dominating* one. Past 3–4 levels the chains tend to wander into V8 optimisation metadata — treat deep runs as hints, shallow runs as evidence.
- The streaming parser in `streamArray` is a purpose-built bracket matcher, not a general JSON parser. It uses UTF-16 code-unit offsets (via `charAt`/`slice`) deliberately; do not switch to `codePointAt` without adjusting the slicing logic.
- The `strings` array is only partially cached: entries shorter than 90 characters or containing the wanted kind string are kept in `nameOf`; everything else is dropped to save memory.
- Retainer-chain deduplication: a `seen` set prevents cycles, and the chooser prefers a retainer whose type differs from the target's to break `buffer → buffer` self-loops.
