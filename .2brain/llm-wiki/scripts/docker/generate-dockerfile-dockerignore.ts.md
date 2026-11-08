---
source: scripts/docker/generate-dockerfile-dockerignore.ts
sha256: babafd1d6c4b5049320d753e1be107163cc12e1a96432439deea45703cfd4744
generated_at: 2026-11-08T02:46:15.435051+00:00
model: ollama:qwen3.8:27b
---

# scripts/docker/generate-dockerfile-dockerignore.ts

## Purpose

Generates `docker/Dockerfile.dockerignore` from the root `.dockerignore`. Docker and Buildah use a per-Dockerfile `.dockerignore` *instead of* (not merged with) the root file, so a second copy is required. Hand-maintaining that copy caused drift before; deriving it eliminates that risk. The one deliberate modification is keeping `.git` in the image, because `npm run complete` (run inside this image by the `gate` service and `container-gate` CI job) invokes an ESLint rule that shells out to `git ls-files`.

## Key elements

- **`SOURCE`** — Path to the root `.dockerignore` (read as the derivation source).
- **`TARGET`** — Path to `docker/Dockerfile.dockerignore` (the generated output).
- **`HEADER`** — Multi-line comment block explaining the purpose, the `.git` exception, and the generation origin. Prepended to the output.
- **`blocksOf(content)`** — Splits file content on blank lines into an array of blocks, so the `.git` section can be removed as a single unit.
- **`derive()`** — Reads the root file, filters out the block starting with `# Version control` (the `.git` exclusion), and returns `HEADER + kept blocks`.
- **`writeOrCheck(TARGET, next, …)`** — Writes the derived content, or (with `--check`) reports drift without rewriting. Used by `npm run complete`.

## Relationships

- **`scripts/modules-on-disk.ts`** — Provides `REPO_ROOT`, used to construct both `SOURCE` and `TARGET` paths.
- **`scripts/contracts/generated-file.ts`** — Provides `writeOrCheck`, the shared write-or-verify helper that this script uses to emit (or check) the generated file.

## Notes

- The filter is block-based (`split('\n\n')`), not line-based. The `.git` entry must be preceded by a `# Version control` comment within the same blank-line-delimited block for it to be correctly dropped.
- The `--check` flag (handled inside `writeOrCheck`) is the mode used by `npm run complete` to detect drift without modifying the file.
- This script targets `docker/Dockerfile` specifically. The sibling `docker/Dockerfile.production` has the same `.git`-absent problem but sidesteps it by never running `lint`; no analogous generated file exists for it.
