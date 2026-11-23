---
source: scripts/contracts/build-bundles.ts
source_sha256: 7891c2dd0bd5bd573994241af047cfb541d2a70f09460ee7e5af2901f2357433
context_sha256: 34ce085b23ec85e8519f6b744b9d66860066053b5f93cd57cffabea0d212c0f3
generated_at: 2026-11-22T01:54:02.527693+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/build-bundles.ts

## Purpose
CLI script (`npm run contracts:bundle`) that rebuilds the published contract documents (bundles) from their source fragments. Fragments are the source of truth; the bundles are `.gitignore`d outputs read by spectral, orval, Prism and the spec-identity check. The selection logic lives in this script rather than `package.json` because npm appends `--` arguments only to the last command of a chain.

## Key elements
- **CLI parsing**: `--check` sets `checkOnly`; any non-`--` argument is a bundle name. No names means a full run.
- **Unknown-name guard**: unrecognised bundle names print the known list and exit with code 2.
- **`bundle(bundles)`**: assembles each bundle in parallel via `assembleBundle`, compares the result with `readCommittedBundle`, and writes only the drifted ones (skipped under `--check`). Returns the stale bundles.
- **`report(total, stale, problem, advice)`**: under `--check`, exits 1 listing stale bundles plus the fix advice. Otherwise logs what was rebuilt or that nothing needed writing.
- **`fail(message)`**: logs the message and exits 1. Typed `never`.
- **`run()`**: the main flow, with two modes:
  - *Named run*: builds exactly the named bundles. Under `--check`, it refuses client collections (generated bundles) with an explanation.
  - *Full run*: builds only the authored (non-generated) bundles.
- Any rejection from `run()` is logged and exits 1.

## Relationships
- **`./bundle-registry`**: provides `CONTRACT_BUNDLES`, `findBundle`, `isGenerated`, `assembleBundle`, `readCommittedBundle` and the `ContractBundle` type. All bundle knowledge and assembly lives there.
- **`../modules-on-disk`**: provides `REPO_ROOT`, used to print repo-relative paths.
- **`bundle-kinds.ts`**: a neighbor in the graph. This file does not import it directly, so it is presumably reached through the registry.

## Notes
- Client collections (e.g. `bruno`) are opt-in. They are generated from `openapi.yaml` on disk, not from fragments, and are never produced by a full run.
- `--check` is deliberately rejected for generated bundles. They have no committed copy, so the check would always report "stale" and become a permanently red CI gate.
- A named collection is regenerated from the committed contract, not from one assembled in the same run.
- The full-run stale advice says authored bundles must stay byte-identical with a paired repo, so the result has to be copied there too.
- The script calls `process.exit(0)` after a named run, so nothing after it executes.
