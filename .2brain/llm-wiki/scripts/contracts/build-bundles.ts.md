---
source: scripts/contracts/build-bundles.ts
sha256: 35d4af72063f771ebbde6ed99feec6849caf883ccd6c0ec7132c27d7259e05c3
generated_at: 2026-10-01T12:25:34.217258+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/build-bundles.ts

## Purpose

CLI entry point (`npm run contracts:bundle`) that rebuilds the repo's published API contract bundles from their source fragments. Fragments are the source of truth; the resulting `openapi.yaml`, `asyncapi.yaml`, and `asyncapi.public.yaml` are what downstream tools (spectral, orval, Prism, `check:spec-identity`) consume. Supports a `--check` mode that asserts freshness without writing, and name-based selection to narrow the run.

## Key elements

- **`bundle(bundles)`** — Assembles each bundle via `assembleBundle`, diffs against the committed copy with `readCommittedBundle`, and (unless `--check`) writes only the files that drifted. Returns the list of stale bundles.
- **`run()`** — Top-level orchestration. Two paths:
  - *Narrowed* (one or more bundle names passed): builds exactly those, including generated collections if explicitly named.
  - *Full* (no names): builds only **authored** bundles (excludes `isGenerated` entries) to avoid writing unrequested client-collection files.
- **`fail(message)`** — Prints an error and `process.exit(1)`.
- **`relative(file)`** — Resolves a path relative to `REPO_ROOT` for user-friendly log output.
- **Argument parsing** (top-level): extracts `--check` flag and positional bundle names; validates names against `CONTRACT_BUNDLES` and exits with code 2 on unknowns.

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — Sole import. Provides the bundle catalog (`CONTRACT_BUNDLES`, `findBundle`), the assembly engine (`assembleBundle`), the committed-file reader (`readCommittedBundle`), the `isGenerated` predicate, `REPO_ROOT`, and the `ContractBundle` type. All read/write logic for individual bundles lives there; this file is purely selection, diffing, and I/O policy.

## Notes

- **`--check` + generated bundles is an explicit error**, not a stale verdict. Generated collections (e.g. Bruno) are `.gitignore`d by design, so "stale" is meaningless; the script refuses rather than letting CI show a permanently red gate.
- **Named selection builds from the committed contract, not from a freshly-assembled one.** If you name a generated collection, it regenerates from the committed `openapi.yaml` on disk, not from a fragment-assembled version that this same run might produce.
- **Selection lives here rather than in `package.json`** because npm appends `--` args to the last command in a `&&` chain, which would silently drop the flag.
- **Full-run output is intentionally limited to authored bundles.** The four generated client-collection files are opt-in (`-- bruno`, etc.) to avoid writing files no check reads.
- **`openapi.yaml` is `.gitignore`d and rebuilt on every install; `asyncapi.yaml` and `asyncapi.public.yaml` are committed.** The `--check` mode and the stale-diff logic account for this asymmetry.
- Exit codes: `0` success/up-to-date, `1` stale or runtime error, `2` unknown bundle name.
