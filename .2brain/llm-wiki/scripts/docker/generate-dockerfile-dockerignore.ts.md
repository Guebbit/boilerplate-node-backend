---
source: scripts/docker/generate-dockerfile-dockerignore.ts
sha256: babafd1d6c4b5049320d753e1be107163cc12e1a96432439deea45703cfd4744
generated_at: 2026-10-29T01:33:13.528863+00:00
model: ollama:qwen3.8:27b
---

# scripts/docker/generate-dockerfile-dockerignore.ts

## Purpose

Generates `docker/Dockerfile.dockerignore` from the root `.dockerignore`, removing the need to hand-maintain a second copy. Docker and Buildah look for a `<dockerfile-name>.dockerignore` next to the Dockerfile and use it **instead of** (not merged with) the root file. The one deliberate difference from the root: the `.git` exclusion is dropped, because `npm run complete` (run inside this image by the `gate` service and `container-gate` CI job) includes `lint`, and the `local/comment-links` ESLint rule shells out to `git ls-files` and hard-crashes without a `.git` directory.

## Key elements

- **`SOURCE`** — resolved path to the root `.dockerignore`; the single input.
- **`TARGET`** — resolved path to `docker/Dockerfile.dockerignore`; the output.
- **`HEADER`** — multi-line comment string prepended to the generated file, documenting the purpose, the `.git` exception, and the generation provenance.
- **`blocksOf(content)`** — splits file content into blank-line-separated blocks for whole-unit filtering.
- **`derive()`** — reads the root file, drops any block whose first line is `# Version control`, and returns the header plus the remaining blocks.
- **`next`** — module-level constant holding the derived content (computed once at load).
- **`writeOrCheck(TARGET, next, …)`** — writes the file in `regenerate` mode or reports drift in `--check` mode (used by `complete`).

## Relationships

- **`scripts/contracts/generated-file.ts`** — supplies `writeOrCheck`, the shared helper that either writes the target or diffs against it and reports drift. This file is a consumer of that contract.
- **`scripts/modules-on-disk.ts`** — supplies the `REPO_ROOT` constant used to build absolute paths for `SOURCE` and `TARGET`.

## Notes

- The filter is comment-based (`startsWith('# Version control')`), not path-based. If the root `.dockerignore` ever renames that section header, the `.git` lines would silently remain in the generated file.
- The script is a top-level executable (`tsx` shebang); it is not imported as a module. All logic runs at import time via the `next` constant.
- `docker/Dockerfile.production` has the same `.git` gap but avoids it by never running `lint`; this Dockerfile's image must run `npm run complete` unmodified, so keeping `.git` in is non-negotiable here.
