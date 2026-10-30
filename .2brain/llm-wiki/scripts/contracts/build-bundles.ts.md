---
source: scripts/contracts/build-bundles.ts
sha256: 43ee8e3f7cabf0797374a9a23b80a5d6ddde054ec4419d068f871517b4977ecc
generated_at: 2026-10-29T01:29:48.931417+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/build-bundles.ts

## Purpose

CLI entry point (`npm run contracts:bundle`) that rebuilds the repo's published contract bundles from their source fragments. Supports a `--check` mode (assert freshness without writing) and optional positional names to narrow the run to specific bundles. Generated (client-collection) bundles are opt-in and treated differently from authored bundles because they are not committed to git.

## Key elements

- **`bundle(bundles)`** — Assembles each bundle via `assembleBundle`, compares to `readCommittedBundle`, writes only those that drifted (skipped under `--check`). Returns the stale subset.
- **`report(total, stale, problem, advice)`** — Under `--check`, exits 1 if any bundle is stale; otherwise prints a summary of what was written or confirms everything matched.
- **`run()`** — Orchestrates the two code paths:
  - *Narrowed* (positional names given): resolves via `findBundle`, rejects `--check` on generated bundles, then calls `bundle` + `report`.
  - *Full* (no names): filters `CONTRACT_BUNDLES` to non-generated entries, then `bundle` + `report`.
- **`fail(message)`** — Prints to stderr and `process.exit(1)`; typed `never`.
- **`relative(file)`** — Resolves a path against `REPO_ROOT` for human-readable log output.
- **Argument parsing** — `--check` flag and remaining positional tokens are extracted from `process.argv.slice(2)`; unknown names produce a usage error (exit 2) listing valid bundle names.

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — Primary dependency. Provides `CONTRACT_BUNDLES`, `findBundle`, `assembleBundle`, `isGenerated`, `readCommittedBundle`, and the `ContractBundle` type. All bundle metadata and assembly logic lives there; this file is the CLI shell.
- **`scripts/modules-on-disk.ts`** — Supplies `REPO_ROOT` for path-relative logging.
- **`scripts/contracts/bundle-kinds.ts`** — Consumed indirectly through `bundle-registry.ts` (the registry defines the bundle kind taxonomy that `isGenerated` checks against).
- **`tests/cross-cutting/example-template.test.ts`** — Exercises the build flow end-to-end against an example fragment, verifying that `bundle` / `report` produce the expected outputs.
- **`scripts/mutation/ci/cli.ts`** — Invokes this script (or its `--check` mode) as part of CI gating; the exit-code contract (0 = fresh, 1 = stale/failed, 2 = usage error) is what that caller relies on.

## Notes

- **Why selection lives here, not in `package.json`**: npm appends `--` args to the *last* command in a `&&` chain, so a multi-step `scripts` entry would silently drop the bundle names.
- **Generated bundles + `--check` is a hard error (exit 1)**, not a "stale" result. Client collections are `.gitignore`d and generated on demand, so asking "is it fresh?" is inapplicable; refusing prevents a permanently-red CI gate.
- **Full run excludes generated bundles by default.** To build a client collection you must name it explicitly (e.g. `npm run contracts:bundle -- bruno`).
- **Staleness is a byte comparison** (`content !== readCommittedBundle(item)`); no timestamps or hashes.
- **Authored bundles are expected to be byte-identical with a paired repo**; the full-run failure message reminds the operator to copy the result over.
