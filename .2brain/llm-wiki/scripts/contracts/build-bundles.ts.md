---
source: scripts/contracts/build-bundles.ts
sha256: 84882b38a60a54fb256db4fdf6c837583c296c8396533c00f3acb8b2d7ee6fbe
generated_at: 2026-11-08T02:39:30.295542+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/build-bundles.ts

## Purpose

CLI entry point (`npm run contracts:bundle`) that rebuilds the repo's published contract bundles (OpenAPI, AsyncAPI, client collections) from their source fragments, or verifies under `--check` that the on-disk copies haven't drifted. It exists so the three consumer tools (Spectral, Orval, Prism) and the spec-identity check always read a bundle that matches the committed fragments.

## Key elements

- **`arguments_` / `checkOnly` / `named`** — CLI parsing: `--check` flag and any explicit bundle names.
- **`unknown`** — early-exit (code 2) validation that every named bundle is a known one.
- **`bundle(bundles)`** — core pipeline: calls `assembleBundle` for each, compares the result to the committed file, writes only stale ones (or reports them under `--check`), returns the stale list.
- **`fail(message)`** — prints an error and exits 1; typed `never` so callers don't need a following `return`.
- **`report(total, stale, problem, advice)`** — prints the outcome; under `--check` with stale bundles, delegates to `fail`.
- **`run()`** — orchestrates the two modes: *named* (exactly what the caller asked for, including generated collections) vs. *full* (only authored, non-generated bundles). Handles the `--check`-on-generated edge case.
- **Entry point** — `run().catch(…)`; any unhandled rejection exits 1.

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — primary dependency. Supplies `CONTRACT_BUNDLES`, `findBundle`, `assembleBundle`, `isGenerated`, `readCommittedBundle`, and the `ContractBundle` type. This file is the thin CLI layer on top of that registry.
- **`scripts/modules-on-disk.ts`** — provides `REPO_ROOT` for the `relative()` helper used in log messages.

## Notes

- **`--check` + generated bundles:** Client collections are `.gitignore`d and never committed, so `--check` explicitly refuses them (exit 1) rather than reporting a permanently-false "stale." This prevents a red CI gate for a file that is absent by design.
- **Full run vs. named run:** A bare `npm run contracts:bundle` builds only *authored* bundles. Generated collections require an explicit name (e.g. `-- bruno`).
- **Why selection lives here, not in `package.json`:** npm only appends `--` args to the *last* command in an `&&` chain, so putting it in a script string would silently drop the flag.
- **Exit codes:** 0 = success, 1 = stale/build failure, 2 = usage error (unknown bundle name).
- **`fail` is `never`:** callers can follow it with further code without a `return`, because TypeScript knows control never resumes.
