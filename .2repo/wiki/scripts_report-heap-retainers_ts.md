# scripts/report-heap-retainers.ts

## Purpose

Answers "who is holding these?" for one kind of heap object by building a **reverse edge index** (CSR layout) over a V8 heap snapshot. It exists because the companion `report-heap-summary.ts` only aggregates node sizes and never reads the `edges` array, so it cannot identify retaining chains. This script is the second step in the workflow: run the summary to find the dominant object kind, then run this to find its owner.

## Key elements

- **`readHeader()`** — Reads the first 128 KiB of the snapshot, regex-extracts `node_fields`, `node_types`, `edge_fields`, `edge_types`, `node_count`, and `edge_count` to determine stride widths and table sizes.
- **`streamArray(key, onChunk)`** — Streams a single top-level JSON array (e.g. `"nodes":[…]`) out of the file using a bracket-depth state machine, yielding raw text chunks so the caller can accumulate into typed arrays without ever holding the whole file in a JS string.
- **`readInts(key, out)`** — Thin wrapper over `streamArray` that parses comma-separated integers into a pre-allocated `Int32Array`.
- **`main()`** (invoked via `void main()`) — Orchestrates the full pipeline:
  1. Reads node and edge tables into `Int32Array`s.
  2. Builds `edgeStart` (outgoing-edge CSR offsets) and a **reverse index** (`retainer` / `retainerEdge`) using the same CSR pattern.
  3. Streams the `strings` table, keeping only names that contain the target kind or are < 90 chars.
  4. Collects target nodes whose name matches the requested kind.
  5. For each target, walks up to `depth` retainer hops (preferring a retainer of a *different* kind to break buffer→buffer loops), then aggregates chains into a `Map` keyed by the joined chain string.
  6. Prints the top 20 chains ranked by total retained bytes.

## Relationships

No files in the dependency graph import or are imported by this script. It is a standalone CLI. The only documented interaction is the **logical workflow** with `report-heap-summary.ts`: the summary identifies which object kind dominates, and this script is then pointed at that kind. The docstring also references `docs/tools/mutation-testing.md#finding-the-culprit` for context.

## Notes

- **Memory:** The entire node and edge table must be resident (`Int32Array` allocations of `nodeCount × stride` and `edgeCount × stride`). For large snapshots the docstring recommends `NODE_OPTIONS=--max-old-space-size=10240`.
- **Non-dominating retainer:** At each hop the script picks the *first* retainer that is not yet in the local `seen` set, not the *dominating* one. Past ~3–4 levels the chain tends to wander into V8-internal optimisation metadata; treat deep output as a hint, shallow output as evidence.
- **`Int32Array` bound:** All indices and sizes fit in a signed 32-bit integer; snapshots exceeding ~2 B nodes/edges or with individual field values above 2³¹ will overflow silently.
- **`wantedStrings` set** is populated by `nodeLabel()` but never read back — it appears to be a leftover from an earlier design and has no runtime effect.
- **String streaming heuristic:** The `strings` stream keeps only entries containing the target kind string or shorter than 90 characters. A target name longer than 90 chars that does *not* contain the kind substring would be silently dropped, causing those nodes to be missed. In practice the kind is a short identifier (e.g. `JSArrayBufferData`), so this is rarely an issue.
- **UTF-16 offsets:** `streamArray` tracks bracket depth in UTF-16 code units (matching `String.prototype.slice`), not bytes. This is intentional and documented inline.
