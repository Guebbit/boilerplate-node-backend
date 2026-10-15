---
source: scripts/contracts/check-asyncapi-breaking.ts
sha256: 23744a6f021c3c577f644469d2bedae3eeeb4906dc99dc64b4748893d2fa6a7e
generated_at: 2026-10-15T09:36:48.702194+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/check-asyncapi-breaking.ts

## Purpose

A CI gate (`npm run check:asyncapi-breaking`) that fails a commit when `asyncapi.public.yaml` — the partner-facing webhook event catalogue — drops or narrows a shape an existing subscriber depends on. It diffs the working-tree bundle against the bundle at the merge-base of the current branch and `origin/main`, so the comparison reflects what would actually ship rather than a possibly-stale local `main`.

## Key elements

- **`BUNDLE`** — hardcoded to `'asyncapi.public.yaml'`; the only file this gate inspects.
- **`base`** — the comparison ref; defaults to `'origin/main'`, overridable via `--base=<ref>`.
- **`bundleAt(ref)`** — reads the bundle at an arbitrary git ref via `git show ref:asyncapi.public.yaml`; returns `undefined` if the file didn't exist yet at that ref.
- **`describe(change)`** — formats a single `DiffOutputItem` as `path (action): before -> after` for human-readable output.
- **`majorVersion(version)`** — extracts the leading `MAJOR` segment of an AsyncAPI version string.
- **`baseCommit`** — result of `mergeBase(base, 'asyncapi-breaking')`; `undefined` means git can't determine it (treated as pass).
- **Main flow (inline, no wrapper function)** — short-circuits on: base not found, file new at base, byte-identical files. Otherwise parses both documents with `@asyncapi/parser`, skips if the major version changed (a deliberate break), then calls `breakingChanges` and exits 1 with a per-change listing.
- **Exit codes** — `0` pass / no-op, `1` breaking changes detected, `2` parse or unexpected error.

## Relationships

- **`scripts/cli.ts`** — supplies `flagValue`, used to read the optional `--base` CLI flag.
- **`scripts/contracts/asyncapi-breaking.ts`** — supplies `breakingChanges`, the structural diff function that compares two dereferenced AsyncAPI JSON documents and returns the list of `DiffOutputItem`s that are breaking.
- **`scripts/git-base.ts`** — supplies `mergeBase`, which resolves the commit at which the branch diverged from `base`.
- **`scripts/modules-on-disk.ts`** — supplies `REPO_ROOT`, the absolute path to the repository root used to resolve `git show` cwd and the on-disk bundle path.

## Notes

- `@asyncapi/diff` (used internally by `breakingChanges`) refuses documents that still contain `$ref`s, so both sides are run through `@asyncapi/parser` first. The parser also provides a version-aware document model.
- A major-version bump is treated as the *intended* break and passes the gate; the gate only catches accidental narrowing/removal within the same major.
- `/info/version` changes are explicitly ignored (handled inside `asyncapi-breaking.ts`).
- The script is a top-level `tsx` entry (shebang `#!/usr/bin/env tsx`); it mixes a synchronous `execFileSync` call for git with an async `Promise.all` for parsing/diffing.
- The `--base` flag lets you re-run the check against an arbitrary ref (e.g. `HEAD~3`) without changing branch state.
