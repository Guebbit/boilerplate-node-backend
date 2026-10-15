---
source: scripts/docker/generate-dockerfile-dockerignore.ts
sha256: b09c063a68690809eed93bf57d39850b152bb11e67a1edcce514a590782f1af7
generated_at: 2026-10-15T09:39:14.376265+00:00
model: ollama:qwen3.8:27b
---

# scripts/docker/generate-dockerfile-dockerignore.ts

## Purpose

Generates `docker/Dockerfile.dockerignore` from the root `.dockerignore` to eliminate manual drift. Docker and Buildah use a `<dockerfile-name>.dockerignore` file **instead of** (not merged with) the root `.dockerignore`, so a hand-maintained copy will inevitably fall out of sync. The script derives the override automatically, applying one deliberate edit: keeping `.git` included.

## Key elements

- **`SOURCE`** — Path to the root `.dockerignore` (the input).
- **`TARGET`** — Path to `docker/Dockerfile.dockerignore` (the output).
- **`HEADER`** — A multi-line comment block prepended to the generated file, documenting the purpose, the `.git` exception, and the "do not hand-edit" policy.
- **`blocksOf(content)`** — Splits a `.dockerignore` body into blank-line-separated blocks so a section can be dropped atomically.
- **`derive()`** — Reads the root file, drops the block whose comment starts with `# Version control` (which contains the `.git` entry), and returns `HEADER` + remaining blocks.
- **`writeOrCheck(TARGET, next, …)`** — Writes the derived content to `TARGET`, or in `--check` mode reports drift without rewriting (used by `npm run complete`).

## Relationships

- **`scripts/modules-on-disk.ts`** — Imports `REPO_ROOT` to anchor the `SOURCE` and `TARGET` paths relative to the repository root.
- **`scripts/contracts/generated-file.ts`** — Imports `writeOrCheck`, the shared helper that either writes a generated file or performs a drift check, and supplies the "how to regenerate" message shown on drift.

## Notes

- The `.git` exclusion is removed by dropping the block that begins with `# Version control`, not by filtering the literal `.git` line. If the root file's comment wording changes, the filter silently stops working and `.git` will be excluded — breaking the `local/comment-links` ESLint rule (which shells out to `git ls-files`).
- `docker/Dockerfile.production` faces the same `git ls-files` issue but sidesteps it by never invoking `lint`; this Dockerfile runs `npm run complete` unmodified, so it must keep `.git`.
- The generated file is explicitly marked "Do not hand-edit" in its own header; the regeneration command is `npm run docker:dockerignore` (or the full `npm run regenerate`).
