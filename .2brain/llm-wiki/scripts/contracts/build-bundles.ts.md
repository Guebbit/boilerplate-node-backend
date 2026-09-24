---
source: scripts/contracts/build-bundles.ts
sha256: 92e6621d266abed4964ec76170559cac1b319cbc07a7a6a4787107c23bab433b
generated_at: 2026-09-23T17:21:44.559393+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/build-bundles.ts

## Purpose

CLI entry point (`npm run contracts:bundle`) that assembles committed contract bundles (OpenAPI, AsyncAPI, etc.) from their source fragments. Fragments are the source of truth; the produced bundle files stay committed because downstream tools (Spectral, Orval, Prism, `check:spec-identity`) read them directly. Supports a `--check` mode that asserts bundles are current without rewriting, and name-based selection to narrow a run.

## Key elements

- **Argument parsing (top-level)** — Reads `process.argv` for a `--check` flag and optional bundle names. Exits with code 2 on unknown names.
- **`bundle(bundles)`** — Assembles each bundle via `assembleBundle`, compares the result to the committed file (`readCommittedBundle`), and writes only the stale ones (skips writes in `--check` mode). Returns the list of stale bundles.
- **`fail(message)`** — Prints an error and exits with code 1.
- **Named-run branch** (`named.length > 0`) — Selects exactly the bundles the user asked for. Refuses `--check` on generated (client-collection) bundles since they are not committed. Assembles, reports staleness, and exits.
- **Full-run branch** (no names given) — Assembles only authored (`!isGenerated`) bundles. The four client collections are deliberately excluded; they are generated on demand and `.gitignore`'d.
- **`relative(file)`** — Shortens output paths relative to `REPO_ROOT` for human-readable log lines.

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — Direct dependency. Imports `assembleBundle`, `CONTRACT_BUNDLES`, `findBundle`, `isGenerated`, `readCommittedBundle`, `REPO_ROOT`, and the `ContractBundle` type. This file contains all the bundle metadata and the actual fragment-assembly logic that `build-bundles.ts` orchestrates.
- **`scripts/contracts/bundle-kinds.ts`** — Indirect dependency (pulled in through `bundle-registry.ts`). Provides the bundle kind definitions that shape the `CONTRACT_BUNDLES` list.
- **`tests/cross-cutting/mail-copy.test.ts`** — Indirect consumer. Tests behaviour of the contract surfaces whose bundles this script produces; not imported by or importing this file directly.

## Notes

- **Why selection lives here, not in `package.json`:** npm appends `--` arguments only to the *last* command in a `&&` chain, so putting the flag after a chained script would silently drop it. Keeping the logic in this script sidesteps that.
- **Generated vs. authored bundles:** Client collections (e.g. Bruno) are opt-in by name, are not committed, and are generated from the *committed* contract file rather than from fragments. `--check` refuses them outright rather than reporting them as perpetually stale, which would create a permanently red CI gate.
- **Paired-repo sync:** The `--check` failure message for authored bundles reminds the operator that every authored bundle is byte-identical with a paired repo and must be copied over after rebuilding.
- **Exit codes:** 0 = success (built or up-to-date), 1 = stale or `--check` violation, 2 = unknown bundle name.
