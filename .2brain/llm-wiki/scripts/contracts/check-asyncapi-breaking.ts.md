---
source: scripts/contracts/check-asyncapi-breaking.ts
sha256: d57178a004d6db76984b5d7e4db4985ec0d6d3472ab83a430e77c353199771e9
generated_at: 2026-10-01T12:26:07.295773+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/check-asyncapi-breaking.ts

## Purpose

CI gate that fails a PR if `asyncapi.public.yaml` (the partner-facing webhook event catalogue) drops or narrows something a subscriber already depends on. Compares the working-tree bundle against a base ref (default `origin/main`, overridable via `--base=`) using `@asyncapi/diff`, and exits non-zero when breaking changes are detected within the same major AsyncAPI version.

## Key elements

- **`BUNDLE`** — constant naming the single file under guard: `asyncapi.public.yaml`.
- **`bundleAt(ref)`** — reads `BUNDLE` at an arbitrary git ref via `git show`; returns `undefined` if the ref predates the file.
- **`describe(change)`** — formats a single `DiffOutputItem` as a one-line `path (action): before -> after` string for console output.
- **`majorVersion(version)`** — extracts the leading numeric segment of an AsyncAPI version string.
- **Top-level flow** — resolves the base commit via `mergeBase`, loads before/after documents, parses both with `@asyncapi/parser`, skips the diff if the major version changed (treated as the deliberate break), then calls `diff(...).breaking()` and exits `1` with a human-readable list if any breaking changes exist.
- **`--base=` CLI flag** — parsed from `process.argv`; defaults to `origin/main`.

## Relationships

- **`scripts/git-base.ts`** — imports `REPO_ROOT` (for `cwd` and `path.join` in file reads) and `mergeBase` (to compute the common ancestor of the base ref and the current branch, so the diff reflects what would actually ship rather than a potentially stale local `main`).

## Notes

- The script uses a **callback/Promise** flow (`.then`/`.catch`) rather than `async`/`await` despite the `asyncapi/diff` import being synchronous — the `Parser.parse` call is the only async step.
- Exit codes: `0` = pass (no breaking changes, file unchanged, file absent at base, or major-version bump); `1` = breaking changes found; `2` = parse failure or unexpected error.
- `@asyncapi/diff` throws a `TypeError` (not a result) when documents cross major versions, so the script explicitly checks major version *before* calling `diff`.
- The merge-base ref name passed to `mergeBase` is the literal string `'asyncapi-breaking'` (a label, not a branch name).
