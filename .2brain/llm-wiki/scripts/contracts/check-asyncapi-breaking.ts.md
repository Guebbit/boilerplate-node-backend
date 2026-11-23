---
source: scripts/contracts/check-asyncapi-breaking.ts
source_sha256: 12aac69743031c85ed8adc0cb349d28e6bfb26e1da4e95954ecf5cda1fd8da6b
context_sha256: 26e835281431c3dcf7b8b8a0a39c2fb0775f1e144a44b3648ecb25db5095f175
generated_at: 2026-11-22T01:54:48.697746+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/check-asyncapi-breaking.ts

## Purpose
A `tsx` script, run as part of `npm run check`, that fails when the public AsyncAPI bundle (the partner-facing webhook event catalogue) drops or narrows something a subscriber already depends on. The bundle is generated rather than committed. The script builds it as it existed at the merge-base with `origin/main`, then diffs it against the bundle currently on disk.

## Key elements
- `BUNDLE`: a constant holding the filename of the public AsyncAPI bundle, the only bundle this gate checks.
- `base`: the git ref to compare against. It is `origin/main` unless `--base=<ref>` is passed (read through `flagValue('base')`).
- `bundleAt(ref)`: builds the bundle for a commit.
  - It runs `git archive` to a tar in a temp dir, extracts it, and symlinks the repo's `node_modules` into the extracted tree.
  - It then runs that tree's own bundler script (`scripts/contracts/build-bundles.ts asyncapi-public`) via `npx tsx` and reads the resulting file.
  - It returns `undefined` on any failure, which is treated as "no such ref/file". A `CommandTimeoutError` is rethrown instead. The temp dir is always removed.
- `describe(change)`: formats a breaking change as `path (action): before -> after`.
- `majorVersion(version)`: returns the leading major segment of a version string.
- Top-level flow:
  1. Resolve `baseCommit` with `mergeBase(base, 'asyncapi-breaking')`.
  2. Build `before` with `bundleAt` and read `after` from disk.
  3. Parse both with `@asyncapi/parser`.
  4. Compare the two major versions.
  5. Call `breakingChanges(...)` on the two `.json()` documents and report.

## Relationships
- `scripts/cli.ts`: supplies `flagValue` for the `--base` flag.
- `scripts/git-base.ts`: supplies `mergeBase`, which finds the commit where the branch left `base`.
- `scripts/modules-on-disk.ts`: supplies `REPO_ROOT`, used as the git working directory, the `node_modules` source and the location of the current bundle.
- `scripts/contracts/run-with-timeout.ts`: supplies `runWithTimeout` (used for `git`, `tar` and `npx`) and `CommandTimeoutError`.
- `scripts/contracts/asyncapi-breaking.ts`: supplies `breakingChanges`, which does the actual diff. Per the header comment, it also ignores `/info/version`.

## Notes
- Exit codes:
  - 0: no merge-base, base lacks the bundle, bundles are byte-identical, no breaking changes, or the major AsyncAPI version changed.
  - 1: breaking changes were found.
  - 2: a document failed to parse (the message suggests `npm run lint:asyncapi`) or an unexpected error occurred.
- Most failure modes to build or find the base pass silently. The exception is a hung child process: `CommandTimeoutError` propagates so the gate fails rather than passing.
- A major AsyncAPI version bump is treated as a deliberate break and passes. `@asyncapi/diff` throws a `TypeError` across major versions, so the script skips the diff in that case.
- Both documents go through `@asyncapi/parser` first because `@asyncapi/diff` requires dereferenced input.
- The "after" side is read from disk. It relies on `npm run regenerate` having written the current bundle.
- `node_modules` is symlinked into the base tree rather than installed, on the assumption that the bundle step needs no generated files.
- The top-level `process.exit(0)` calls run before the parser setup, so the script is not safe to import as a module.
