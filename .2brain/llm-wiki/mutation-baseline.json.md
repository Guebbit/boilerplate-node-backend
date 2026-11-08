---
source: mutation-baseline.json
sha256: 7715d58b115d6f53842bf48d59eb6f1fdd19137845bb084f8ee41141d1a536c8
generated_at: 2026-11-08T02:25:56.024195+00:00
model: ollama:qwen3.8:27b
---

# mutation-baseline.json

## Purpose

A snapshot of per-file mutation-coverage scores (percentage of mutants killed) recorded at a specific point in time. It serves as the reference baseline that the CI mutation-testing workflow compares subsequent runs against, so regressions in test quality can be detected as diffs rather than absolute thresholds.

## Key elements

- **`generatedAt`** – ISO-8601 timestamp of when the baseline was produced. Useful for staleness checks.
- **`files`** – A flat map keyed by relative source file path (e.g. `src/infrastructure/http/response.ts`) to a numeric score between 0 and 100 representing the mutation-kill percentage for that file at baseline time.

## Relationships

- **`github/workflows/mutation.yml`** – The CI workflow that (presumably) reads this file, runs a fresh mutation-testing pass, and compares the resulting per-file scores against the values stored here to gate the pipeline or report drift.

## Notes

- The score is a **percentage**, not a count. A value of `0` can mean either "no mutants were generated for that file" or "no mutants were killed"—the file alone does not distinguish the two.
- The file is a **write-only artifact** from the mutation runner's perspective (it is regenerated when a new baseline is committed), not a configuration consumed by the test suite at runtime.
- File paths are relative to the repository root and cover `src/infrastructure/`, `src/kernel/`, and `src/modules/`. Adding or removing source files without regenerating the baseline will cause unmatched keys in the next CI comparison.
- Timestamps are in UTC (`Z` suffix); do not localise them when reading.
