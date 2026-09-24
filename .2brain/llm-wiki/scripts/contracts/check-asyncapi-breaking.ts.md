---
source: scripts/contracts/check-asyncapi-breaking.ts
sha256: 52bb094a220a3cc51bae1d44313c92e0483855459d2296ee7cfb54f61dc827ce
generated_at: 2026-09-23T17:22:14.727877+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/check-asyncapi-breaking.ts

## Purpose

CI gate that fails when `asyncapi.public.yaml` (the partner-facing webhook event catalogue) drops or narrows any event shape a subscriber already depends on. Compares the working-tree bundle against the same file at the merge-base of the current branch and a base ref (default `origin/main`), then reports any breaking changes via `@asyncapi/diff`.

## Key elements

- **`BUNDLE`** — constant pinning the one file this gate inspects: `asyncapi.public.yaml`.
- **`base`** — the comparison ref, read from a `--base=` CLI flag or defaulting to `origin/main`.
- **`bundleAt(ref)`** — reads `BUNDLE` at a git ref via `git show`; returns `undefined` if the file did not yet exist at that ref.
- **`describe(change)`** — formats a single `DiffOutputItem` as a one-line `path (action): before -> after` string for terminal output.
- **`majorVersion(version)`** — extracts the leading `MAJOR` segment of an AsyncAPI version string.
- **Main flow** — reads before/after, parses both with `@asyncapi/parser`, short-circuits on major-version crossings, then calls `diff(...).breaking()` and exits 1 if any breaking changes are found.

## Relationships

- **`scripts/git-base.ts`** — provides `REPO_ROOT` (used as `cwd` for the `git show` call and for joining the working-tree path) and `mergeBase` (computes the actual comparison commit so the diff reflects "what would ship" rather than a possibly-stale local `main` tip).

## Notes

- `@asyncapi/diff` **throws a `TypeError`** (not a result) when the two documents cross a major AsyncAPI version. The script therefore checks major versions first and treats a major bump as the deliberate break, exiting 0.
- Both documents must be dereferenced before diffing; the script routes them through `@asyncapi/parser` to satisfy that requirement.
- Exit codes: **0** = no file at base / unchanged / no breaking changes / major bump; **1** = breaking changes detected; **2** = parse failure or unexpected error.
- The merge-base is computed with the label `'asyncapi-breaking'` (a branch-alias for the computation, not a real branch).
