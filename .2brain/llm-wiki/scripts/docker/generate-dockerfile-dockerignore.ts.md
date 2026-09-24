---
source: scripts/docker/generate-dockerfile-dockerignore.ts
sha256: c64c150d9b2d7689cdd58aafa0db9ab4d6904e0f83f180135dd28bcd6641ffd3
generated_at: 2026-09-23T17:24:36.081092+00:00
model: ollama:qwen3.8:27b
---

# scripts/docker/generate-dockerfile-dockerignore.ts

## Purpose

Generates `docker/Dockerfile.dockerignore` from the root `.dockerignore`, applying one deliberate modification (keeping `.git` included). Exists to eliminate hand-kept duplication that previously drifted silently. Runnable in two modes: rewrite (default) or drift-check (`--check`).

## Key elements

- **`checkOnly`** — boolean set from `process.argv.includes('--check')`; switches behavior from writing to comparing-and-reporting.
- **`SOURCE` / `TARGET`** — resolved paths to the root `.dockerignore` and the generated `docker/Dockerfile.dockerignore`, anchored at `ROOT` (two levels up from `scripts/docker/`).
- **`HEADER`** — a static multi-line comment block explaining the file's origin, the `.git` exception, and the "do not hand-edit" warning. Prepended to every generated output.
- **`blocksOf(content)`** — splits a `.dockerignore` into blank-line-separated blocks (`.trimEnd().split('\n\n')`).
- **`derive()`** — reads `SOURCE`, filters out the block whose first line starts with `# Version control`, joins the kept blocks, and prepends `HEADER`. Returns the full target file content as a string.
- **Main flow** — if `checkOnly`, compares `TARGET`'s current content to `derive()`'s output and exits 1 with a message on mismatch; otherwise writes the derived content to `TARGET` and logs a confirmation.

## Relationships

No graph neighbors recorded. The script is invoked by the npm scripts `docker:dockerignore` (rewrite) and `complete` (via `--check`), and it writes the file consumed by `docker/Dockerfile` at build time.

## Notes

- Docker/Buildah resolve `<dockerfile-name>.dockerignore` **instead of** the root `.dockerignore` — they do not merge. The generated file must therefore repeat the full root list.
- The single intentional difference is that `.git` is **kept in** (the `# Version control` block is removed). This is required because `npm run complete` runs the `local/comment-links` ESLint rule, which shells out to `git ls-files`; without the `.git` directory the rule hard-crashes rather than reporting a waivable finding.
- The filter is purely syntactic: it drops the first block whose leading line starts with `# Version control`. If the root file restructures that block, the filter silently fails to match and `.git` will be excluded.
- The generated file's first line is `#`, not a blank line; the `HEADER` constant ends with a newline before the kept blocks are joined, so the output has exactly one blank line between the header and the first rule.
