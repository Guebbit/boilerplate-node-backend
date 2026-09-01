# docs/reference/index.md

## Purpose

Entry-point and navigation hub for the `docs/reference/` section. When you land on an unfamiliar filename, this page tells you what it is, what breaks without it, and which sibling page (or theory page) explains the concept behind it — in one hop. It is a map, not a theory page; it deliberately defers all deeper explanation to linked pages.

## Key elements

- **The map (flowchart + table):** A Mermaid diagram showing the top-level directory tree (root → src → infrastructure/kernel/modules/app, plus contracts, ops, dev, data, tests) and a table linking each area to its dedicated reference page.
- **"How to read an entry" section:** Defines the three-column format every sub-page uses — *File / What it is / Read next* — and the convention that `—` in the last column is a recorded documentation gap.
- **Three-tier classification (Named / Pattern / Excluded):** The rule that every tracked file falls into exactly one tier. *Named* files get their own row; *Pattern* files (one instance of a repeating shape) get a single row plus an inventory; *Excluded* files (generated, vendored, binary) are acknowledged once per directory.
- **"Why there are no file counts":** Explicit policy against hard-coded numbers in prose; shapes ("one per module") are stated instead, with a `git ls-files` one-liner for the reader who needs a count.
- **"Keeping this page true":** The maintenance contract — a commit that adds, moves, or deletes a file must update the page that names it. Includes a `grep`-based audit command to find undocumented files.
- **Tip / Warning callouts:** Direct first-time readers to `../theory/reading-path.md` and warn contributors not to document a file that should not exist.

## Relationships

- **→ `docs/reference/root.md`, `src-app.md`, `src-infrastructure.md`, `src-modules.md`, `contracts.md`, `data.md`, `scripts.md`, `tests.md`, `ops.md`:** This page is the index for all of them. The table in *The map* is the sole link list; each sub-page is expected to link back here as its "parent."
- **→ `docs/theory/modules.md`:** Referenced in the example row (`src/modules.ts`) and in the tip box as the page that explains the module concept behind the Pattern tier.
- **→ `docs/theory/reading-path.md`:** Cited in the tip box as the complementary "read in order" tool (this page is the "I hit a file, get out" tool).

## Notes

- The page explicitly does **not** re-explain anything covered by `docs/theory/`, `docs/tools/`, or `docs/api/`; every entry must link out rather than inline the explanation.
- The three-tier rule is what keeps the reference section to ~10 pages total; violating it (giving every file its own row) is the stated failure mode.
- No automated check enforces the "commit updates the page" rule; it is convention only. The provided `grep` snippet is the only audit aid.
- Files outside git tracking (`dist/`, `node_modules/`, etc.) are out of scope by definition and should not appear in any tier.
