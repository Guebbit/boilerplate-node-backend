---
source: scripts/contracts/check-asyncapi-breaking.ts
sha256: b708d6dae0ce9a6474f7d0eabf01abcc24fdb81252850fdefba9e419f6f3435e
generated_at: 2026-09-27T13:52:51.913266+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/check-asyncapi-breaking.ts

## Purpose

CI gate (`npm run check:asyncapi-breaking`) that fails the build when `asyncapi.public.yaml` — the partner-facing webhook event catalogue — drops or narrows a shape a subscriber already depends on. It compares the working-tree bundle against the version at the merge-base with a base ref (default `origin/main`), so it measures "what would this change actually ship."

## Key elements

- **`BUNDLE`** — hard-coded to `asyncapi.public.yaml`; the only contract this gate guards.
- **`base`** — comparison ref, taken from `--base=<ref>` CLI flag or defaulting to `origin/main`.
- **`bundleAt(ref)`** — `git show <ref>:asyncapi.public.yaml`; returns `undefined` if the file didn't exist at that ref.
- **`describe(change)`** — renders one `DiffOutputItem` as `path  (action): before -> after` for human-readable output.
- **`majorVersion(version)`** — extracts the leading segment of an AsyncAPI version string (e.g. `"2.0.0"` → `"2"`).
- **Main async flow** — parses both documents with `@asyncapi/parser`, short-circuits on a major-version crossing, then runs `@asyncapi/diff` and reports (or exits 1 on) breaking changes.

## Relationships

- **`scripts/git-base.ts`** — provides `REPO_ROOT` (anchors all file paths and `git` cwd) and `mergeBase(base, label)` (resolves the actual comparison commit). If `mergeBase` returns `undefined` the script exits 0 immediately.

## Notes

- `@asyncapi/diff` **throws a `TypeError`** (not a structured result) when the two documents cross a major AsyncAPI version, so the script checks `majorVersion` equality *before* calling `diff`. A major bump is treated as the deliberate, reviewed break and passes the gate.
- Both documents must go through `@asyncapi/parser` first; `@asyncapi/diff` refuses non-dereferenced input.
- Exit codes: **0** = no breaking changes / nothing to compare / file didn't exist at base; **1** = breaking changes detected; **2** = parse or infrastructure error.
- `--base=` is a simple string-slice parse of `process.argv` (no arg-parsing library), so the flag must appear as `--base=<value>` with no space.
