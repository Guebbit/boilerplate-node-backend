---
source: shared/cases/permission-model-version.cases.yaml
sha256: cf3a911e437ae52203c5770a6760d93fcf6aed9d612bfa1c7524b2dde25273f2
generated_at: 2026-11-08T03:05:54.085808+00:00
model: ollama:qwen3.8:27b
---

# shared/cases/permission-model-version.cases.yaml

## Purpose

Golden test cases that pin down the exact algorithm clients use to compute a **permission-model version** from a set of rule IDs. The version is the first 4 bytes of `sha256(sorted_ids_joined_by_newline)` read as a big-endian unsigned 32-bit integer, allowing clients to cache and validate their rule set without re-fetching.

## Key elements

- **`cases`** — list of named test vectors, each with:
  - `name` — human-readable description of the scenario.
  - `ids` — the input rule-ID list (order intentionally varies across cases).
  - `version` — the expected 32-bit unsigned integer output.
- **Algorithm contract (stated in the top comment):**
  1. Sort IDs by UTF-16 code-unit order (JavaScript default; all IDs are BMP).
  2. Join with `"\n"`.
  3. SHA-256 the resulting UTF-8 string.
  4. Take bytes 0–3 as a big-endian unsigned integer.

## Relationships

- **`shared/authorization-keys.yaml`** — defines the authorization key strings (e.g. `read:Product`, `update:User`) that appear as `ids` in these cases. The key file is the vocabulary; this file is the hashing contract applied to any subset of that vocabulary.

## Notes

- **Order-independence is the point:** cases 1 and 2 use the same set in different orders and must yield the same `version`. If a client's sort diverges from UTF-16 code-unit order, it will produce a mismatch.
- **Empty-set case** (`ids: []`) hashes the *empty string*, not the string `"\n"`. A single ID also has no separator.
- **Non-ASCII IDs** (case 5, `ä`) are sorted *after* ASCII and hashed as UTF-8. The comment flags that a "twin" implementation (e.g. a Rust or Python service) may sort by byte order instead of code units; for pure-BMP strings the two agree, but this case guards the boundary.
- The file is **declarative data only** — no executable code lives here. Any implementation that computes the version must reproduce every `version` value from the corresponding `ids`.
