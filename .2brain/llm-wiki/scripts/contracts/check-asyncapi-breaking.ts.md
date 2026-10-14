---
source: scripts/contracts/check-asyncapi-breaking.ts
sha256: 559a8be91e7ffb235e7215cc6b603ef462009a407f56269607d3f37b3f3c95de
generated_at: 2026-10-14T07:10:32.846876+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/check-asyncapi-breaking.ts

## Purpose

CI/commit gate that fails when `asyncapi.public.yaml` (the partner-facing webhook event catalogue) drops or narrows a shape a subscriber already depends on. It diffs the working-tree bundle against its state at the merge-base of the current branch and a base ref (default `origin/main`), and exits non-zero if any breaking change is detected.

## Key elements

- **`BUNDLE`** – constant `"asyncapi.public.yaml"`; the only file this gate inspects.
- **`base` / `baseArgument`** – resolves the comparison ref from a `--base=<ref>` CLI flag, falling back to `origin/main`.
- **`bundleAt(ref)`** – retrieves the bundle's content at a git ref via `git show`; returns `undefined` if the file did not yet exist at that ref.
- **`describe(change)`** – formats a single `DiffOutputItem` as `path (action): before → after` for console output.
- **`majorVersion(version)`** – extracts the leading segment of an AsyncAPI version string for major-bump detection.
- **`baseCommit`** – computed via `mergeBase`; when `undefined` the gate exits 0 (nothing to compare).
- **Main flow** – parses both bundles with `@asyncapi/parser`, skips on major-version change, delegates to `breakingChanges()`, and exits `0` (pass), `1` (breaking changes), or `2` (parse/infra error).

## Relationships

- **`scripts/contracts/asyncapi-breaking.ts`** – provides `breakingChanges(beforeJson, afterJson)`, the classification logic that inspects `@asyncapi/diff` output and returns the list of breaking changes (and applies the `/info/version` exclusion).
- **`scripts/git-base.ts`** – provides `REPO_ROOT` (used as `cwd` for all `git`/`fs` calls) and `mergeBase(base, label)` (computes the actual commit to compare against).

## Notes

- Both documents are run through `@asyncapi/parser` before diffing because `@asyncapi/diff` throws on non-dereferenced `$ref`s.
- A **major** AsyncAPI version change (e.g. `1.x → 2.0`) is treated as the deliberate, reviewed break and **passes** the gate; the gate only catches unreviewed narrowing within a major.
- Early-exit (exit 0) paths: file absent at base, byte-identical to base, or `baseCommit` is `undefined`.
- Run via `npm run check:asyncapi-breaking`; override the base with `-- --base=HEAD~3`.
- Shebang is `#!/usr/bin/env tsx` — the script is TypeScript executed directly, not transpiled.
