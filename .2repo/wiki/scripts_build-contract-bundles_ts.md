# scripts/build-contract-bundles.ts

## Purpose
CLI entry point (`npm run contracts:bundle`) that rebuilds the repo's committed contract bundles from their fragment sources. Bundles stay committed because external tooling (Spectral, Orval, Prism, the seed runner, `check:spec-identity`) reads them directly. The script also supports a `--check` mode for CI that fails instead of rewriting, and accepts bundle names to narrow the run.

## Key elements
- **CLI argument parsing** (top-level): reads `process.argv`, separates `--check` flag from named bundle identifiers, validates names against the registry, and exits 2 on unknown names.
- **`bundle(bundles)`** — assembles each bundle, compares against the committed copy via `isStale`, and writes only the stale ones (skips writing under `--check`). Returns the stale list.
- **`isStale(bundle)`** — string-compares `assembleBundle(bundle)` against `readCommittedBundle(bundle)`.
- **Narrowed path** (`named.length > 0`): resolves the requested bundles, rejects `--check` on generated (client-collection) bundles, then assembles/checks.
- **Full path** (no names given): iterates `CONTRACT_BUNDLES` filtered by `!isGenerated(item)`, so client collections are excluded unless explicitly named.
- **`fail(message)`** — prints to stderr and calls `process.exit(1)`.

## Relationships
- **`scripts/contracts/bundle-registry.ts`** — direct import; provides `CONTRACT_BUNDLES`, `assembleBundle`, `findBundle`, `isGenerated`, `readCommittedBundle`, `REPO_ROOT`, and the `ContractBundle` type. This script is the primary consumer of that registry.
- **`scripts/contracts/openapi-bundle.ts`, `asyncapi-bundles.ts`, `analytics-events-bundle.ts`, `client-collections-bundle.ts`** — the individual bundle definitions registered in `CONTRACT_BUNDLES`. This script does not import them directly; it operates on them through the registry's assemble/read functions.
- **`scripts/contracts/bundle-kinds.ts`** — defines the bundle-kind taxonomy referenced by the registry types this script consumes.
- **`scripts/regenerate-artifacts.ts`** — upstream orchestrator that invokes this script (or the `contracts:bundle` npm script) as part of a broader artifact-regeneration pipeline.
- **`tests/cross-cutting/mail-copy.test.ts`** — cross-cutting test that exercises output produced by the bundling process.

## Notes
- Selection logic lives in this script (not in `package.json`) because npm appends `--` arguments only to the **last** command in a `&&` chain, which would silently drop flags if the logic were in a script chain.
- Client collections (e.g. Bruno) are **generated and `.gitignore`'d**; they are intentionally excluded from the full run and from `--check`. Request them by name (`npm run contracts:bundle -- bruno`).
- `--check` is a byte-identity assertion: it compares the in-memory assembly to the committed file and exits 1 on any drift. It never writes.
- The script is run with `tsx` (shebang), not compiled ahead of time.
- The stale check is a simple string inequality on the assembled vs. committed text — there is no per-fragment diff or partial write.
