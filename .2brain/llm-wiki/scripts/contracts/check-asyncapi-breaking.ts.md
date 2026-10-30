---
source: scripts/contracts/check-asyncapi-breaking.ts
sha256: cdda20668dee4d685f74fb66981115482f010decf2d928b004e2de713c781228
generated_at: 2026-10-29T01:30:01.209445+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/check-asyncapi-breaking.ts

## Purpose

A gate script (run via `npm run check`) that fails the build when `asyncapi.public.yaml` — the partner-facing webhook event catalogue — drops or narrows a channel, field, or schema that existing subscribers depend on. It diffs the working-tree bundle against the merge-base commit of `origin/main` (or a `--base` override) to model "what this PR would actually ship."

## Key elements

- **`BUNDLE`** (`'asyncapi.public.yaml'`) — the single document this gate inspects.
- **`base`** — git ref for comparison; defaults to `origin/main`, overridable with `--base`.
- **`bundleAt(ref)`** — retrieves the bundle content at a given ref via `git show`; returns `undefined` if the file didn't exist yet.
- **`describe(change)`** — formats a `DiffOutputItem` as `path (action): before -> after` for readable console output.
- **`majorVersion(version)`** — extracts the leading `MAJOR` segment of an AsyncAPI version string.
- **`baseCommit`** — result of `mergeBase(base, …)`; the exact commit the branch forked from.
- **Main async flow** — parses both documents with `@asyncapi/parser` (required because `@asyncapi/diff` rejects unresolved `$ref`s), short-circuits on a major-version bump, then calls `breakingChanges()` to enumerate structural regressions. Exits **1** on breaking changes, **2** on parse failure, **0** otherwise.

## Relationships

- **`scripts/cli.ts`** — provides `flagValue` to read the `--base` CLI argument.
- **`scripts/contracts/asyncapi-breaking.ts`** — provides `breakingChanges(before, after)`, the function that actually classifies which diff items count as breaking (and filters `/info/version`).
- **`scripts/git-base.ts`** — provides `mergeBase(ref, label)`, which resolves the fork-point commit and returns `undefined` if git can't determine it.
- **`scripts/modules-on-disk.ts`** — provides `REPO_ROOT`, used as the `cwd` for `git show` and for joining the on-disk path to `BUNDLE`.

## Notes

- A **major AsyncAPI version bump** (e.g. `1.x` → `2.x`) is treated as the deliberate, reviewed break and causes the gate to **pass** rather than diff; `@asyncapi/diff` itself throws a `TypeError` on cross-major comparisons, so the check is done *before* calling `breakingChanges`.
- If the bundle didn't exist at the base commit (new file on this branch), the script exits 0 with a log line rather than erroring.
- Byte-identical bundles skip parsing entirely.
- The script is top-level executable (`#!/usr/bin/env tsx`) and uses top-level `await`-free async via `Promise.all().then()`.
- `npm run check` is the intended invocation; `npx tsx scripts/contracts/check-asyncapi-breaking.ts --base=HEAD~3` works for ad-hoc runs.
