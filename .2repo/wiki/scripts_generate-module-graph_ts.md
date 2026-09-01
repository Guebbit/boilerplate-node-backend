# scripts/generate-module-graph.ts

## Purpose

Generates the Mermaid dependency diagram and the adjacent module table inside `docs/modules/index.md` from the live import graph (via `dependency-cruiser`), replacing a previously hand-drawn diagram that silently went stale. Supports a `--check` mode that exits non-zero when the page has diverged, for use in CI (`complete`).

## Key elements

- **`SUBDOMAIN`** – Readonly `Record` mapping each of the 13 module names to its strategic-DDD tier (`core` / `supporting` / `generic`). Drives node colour in the diagram.
- **`readEdges()`** – Invokes `npx depcruise` with `--collapse`, `--exclude /tests/`, and `--include-only ^src/modules/`, then regex-parses the Mermaid output to return a sorted `[from, to][]` list. Edges touching `modules.ts` are dropped.
- **`nodeId(name)`** – Replaces hyphens with underscores so names like `audit-logs` are valid Mermaid identifiers.
- **`render(edges)`** – Builds the full replacement block: a `flowchart TD` with classDef colours, plus a Markdown table listing "Reaches / Reached by" per module, sorted by connection weight.
- **`run()`** – Reads `docs/modules/index.md`, locates the `<!-- module-graph:start -->` / `<!-- module-graph:end -->` markers, splices in the generated block, formats the *entire* page with Prettier, then either compares (check mode) or writes the file back.
- **`checkOnly`** – Set when `--check` appears in `process.argv`; gates whether the script writes or merely reports.

## Relationships

No graph neighbors are registered in the dependency graph. At runtime the script reads `docs/modules/index.md`, reads `.dependency-cruiser.cjs` (passed to `depcruise`), and shells out to `npx depcruise` over `src/modules/`. It references `src/modules.ts` and `eslint.config.ts` only in comments to explain filtering choices.

## Notes

- **Prettier is applied to the whole page, not just the block.** This prevents a conflict where `prettier --check` (also run over `docs/` in `complete`) would demand different bytes than the script wrote, undoing each other.
- **`--exclude /tests/` is load-bearing.** Without it the sweep reports 38 edges instead of 19 and describes the test suite rather than the architecture.
- **`modules.ts` is intentionally excluded from edges.** It imports every manifest by definition, which would draw a star that hides the real domain-to-domain shape.
- **`SUBDOMAIN` must stay in sync with `docs/theory/strategic-ddd.md`.** It is the single source of truth for node colour; adding a new module without a tier entry will leave it uncoloured (no `class` assignment) but it will still appear in the table.
- **Markers are mandatory.** If either `<!-- module-graph:start -->` or `<!-- module-graph:end -->` is missing, the script exits 1 with an error and writes nothing.
