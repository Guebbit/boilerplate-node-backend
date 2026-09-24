---
source: scripts/git-base.ts
sha256: d2fa20491fb37f8e21befb359ac838abfc838ffa614a27f463110d02ffd01561
generated_at: 2026-09-23T17:27:34.707974+00:00
model: ollama:qwen3.8:27b
---

# scripts/git-base.ts

## Purpose

Provides shared git plumbing for analysis scripts that need to compare the current branch against a target ref. It centralises the repo-root resolution and the merge-base lookup so that each consuming script doesn't repeat path setup or error handling.

## Key elements

- **`REPO_ROOT`** – Absolute path to the repository root (one level up from `scripts/`). All `git` subprocess calls use this as `cwd`, independent of the caller's working directory.
- **`mergeBase(base, scriptName)`** – Runs `git merge-base HEAD <base>` and returns the common-ancestor SHA. Accepts a `scriptName` string solely for error-message context. Calls `process.exit(2)` (not a thrown exception) when the ref cannot be resolved.

## Relationships

- **`scripts/contracts/check-asyncapi-breaking.ts`** – Consumes `REPO_ROOT` and `mergeBase` to scope its AsyncAPI-breaking-change diff to the correct commit range.
- **`scripts/mutation/run-diff.ts`** – Consumes `REPO_ROOT` and `mergeBase` to compute the baseline SHA before generating a mutation diff.

## Notes

- `mergeBase` does **not** return on failure; it terminates the process with exit code 2. Callers should treat it as a guard, not a fallible function they need to wrap in `try/catch`.
- The function deliberately uses `merge-base` rather than a plain `diff HEAD..<base>` so that unpushed local commits on the target branch do not silently widen the comparison set.
- `REPO_ROOT` is derived from `__dirname`, so it is only correct when the file lives directly under `scripts/`. Relocating the file would require updating the path join.
