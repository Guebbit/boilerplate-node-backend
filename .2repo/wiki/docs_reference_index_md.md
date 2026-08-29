# docs/reference/index.md

## Purpose

Entry point for the **File Glossary** section. When a reader encounters an unfamiliar filename, this page answers "what is it, what breaks without it, and where is the concept explained" in a single hop. It is a navigation map over the repository, not an explanatory document—every entry defers to the theory, tools, or API pages for depth.

## Key elements

- **Repository flowchart (Mermaid)** — A top-level `flowchart TD` showing the directory tree from `Root` → `src/` / `Contracts` / `Ops` / `Data` / `Tests`, with `src/` fanning into `infrastructure/`, `kernel/`, `modules/`, `app/`. Used purely as a visual orientation aid.
- **The map table** — Nine rows linking to the sub-pages that cover each area: `root.md`, `src-app.md`, `src-infrastructure.md`, `src-modules.md`, `contracts.md`, `data.md`, `scripts.md`, `tests.md`, `ops.md`. Each row states what the page covers.
- **How to read an entry** — Defines the three-column entry format (`File` / `What it is` / `Read next`) and the convention that `—` in "Read next" is a tracked documentation gap, not a missing link.
- **Three-tier classification** — Every tracked file is exactly one of: **Named** (unique, gets its own row), **Pattern** (one instance of a repeating shape; the shape gets the row), or **Excluded** (generated, vendored, binary). This is what keeps the glossary to ~10 pages.
- **No file counts** — The page deliberately states *shapes* ("one per module") rather than numbers, pointing readers to `git ls-files` for live counts.
- **Keeping this page true** — Documents the maintenance habit (a file add/move/delete updates the page that names it) and provides a `git ls-files` + `grep` one-liner to audit coverage.

## Relationships

- **`docs/reference/root.md`**, **`contracts.md`**, **`data.md`**, **`ops.md`** — The index table links to each as a child page. This index is the only page in the `reference/` folder that enumerates *all* siblings in one table, making it the de facto router for the section.
- **`docs/.vitepress/`** — The page is rendered by VitePress; its `::: tip` and `::: warning` containers, Mermaid diagrams, and multi-column tables all rely on VitePress-specific extensions. Editing the VitePress config (theme, plugin list, sidebar) can change how this page displays.

## Notes

- The page explicitly positions itself as the **opposite** of the Reading Path (`docs/theory/reading-path.md`): the Reading Path is for first-time readers; this index is for someone who has *already* hit a file and wants out fast.
- The `api/models/` directory is called out as the single largest **Excluded** directory (Orval-generated from `openapi.yaml`); it is regenerated wholesale and should never be hand-edited or hand-documented.
- The maintenance section warns: if writing a glossary row reveals a file that *shouldn't* exist, the correct action is to raise it, not to document the mistake into permanence.
- The three-tier decision flowchart is `flowchart LR` (left-to-right), unlike the repo map which is `flowchart TD` (top-down). Both use custom `classDef` color tokens; the color scheme (amber = entry, blue = code, purple = side) is consistent across both diagrams.
