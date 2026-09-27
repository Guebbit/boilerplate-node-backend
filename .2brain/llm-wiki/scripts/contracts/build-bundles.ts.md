---
source: scripts/contracts/build-bundles.ts
sha256: a6b6ae2a52358653aaf6c179cd84fe61e6843b5973022972d8065952fb3c01a6
generated_at: 2026-09-27T13:52:19.283824+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/build-bundles.ts

## Purpose

CLI entry point for `npm run contracts:bundle`. It rebuilds the committed contract bundles (OpenAPI, AsyncAPI, etc.) from their source fragments, writing only files that have actually drifted. In `--check` mode it verifies staleness without writing, serving as a CI gate. It also handles opt-in regeneration of client collections (generated from the committed contract rather than the fragments).

## Key elements

- **`bundle(bundles)`** (local const) — Assembles each bundle via `assembleBundle`, compares the result to the committed file with `readCommittedBundle`, and writes only the stale ones (unless `--check`). Returns the stale subset.
- **`fail(message)`** — Prints an error and calls `process.exit(1)`.
- **`relative(file)`** — Converts an absolute path to repo-relative for user-facing messages.
- **Argument parsing** (top-level) — Reads `process.argv.slice(2)` for a `--check` flag and zero or more bundle names; validates names against `CONTRACT_BUNDLES` and exits `2` on unknown names.
- **Named-selection path** — Regenerates exactly the bundles asked for. Explicitly refuses `--check` on generated (client-collection) bundles because they are `.gitignore'd` and have no committed copy to compare against.
- **Full-run path** (no names given) — Rebuilds only *authored* bundles (`!isGenerated(item)`); generated collections are excluded to avoid writing files nobody requested.

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — Sole module import. Provides `assembleBundle`, `CONTRACT_BUNDLES`, `findBundle`, `isGenerated`, `readCommittedBundle`, `REPO_ROOT`, and the `ContractBundle` type. All bundle identity, assembly, and I/O logic lives there; this file is purely the orchestration/CLI layer.
- **`scripts/contracts/bundle-kinds.ts`** — Indirect dependency: the `CONTRACT_BUNDLES` entries (defined in `bundle-registry.ts`) reference kind discriminants originating here.
- **`tests/cross-cutting/mail-copy.test.ts`** — Consumes the bundle outputs this script produces; exercises the end-to-end contract-to-artifact pipeline.

## Notes

- **Exit codes:** `0` success / up-to-date, `1` stale or `--check` on a generated bundle, `2` unknown bundle name.
- **`--check` on generated bundles is a hard error, not a pass.** The comment explains the rationale: a "stale" verdict on a file that is absent by design would create a permanently red CI gate that teams learn to ignore.
- **Selection lives here, not in `package.json`.** npm appends `--` args only to the *last* command in a `&&` chain, so putting the flag in the script avoids silently dropped arguments.
- **Paired-repo obligation:** when a bundle is rebuilt, the result must be byte-identical with a paired repo; the `--check` failure message reminds the operator to copy it over.
- The script is invoked via `tsx` (shebang `#!/usr/bin/env tsx`); it has no named exports and is never imported as a module.
- `arguments_` (trailing underscore) is used to avoid shadowing the global `arguments` object.
