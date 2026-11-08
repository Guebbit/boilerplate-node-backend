---
source: shared/cases/env-booleans.cases.yaml
sha256: 457aaeca2cafb993cf2c6361d2c8f14e4a3843f5ecfc746b6d547eaf7c94f46d
generated_at: 2026-11-08T03:05:03.098640+00:00
model: ollama:qwen3.8:27b
---

# shared/cases/env-booleans.cases.yaml

## Purpose
Shared test-case definitions that pin down how a single word is parsed into a boolean value when it arrives via an environment variable, query string, or form field. The file exists so every consumer of the boolean-parsing helper validates against the same contract without each one maintaining its own ad-hoc test list.

## Key elements
- **`cases`** — an ordered list of `{ name, word, expect }` records. Each record feeds `word` through the parser and asserts the result equals `expect`.
- **`expect` values** — three possible outcomes:
  - `true` — the word maps to "on"
  - `false` — the word maps to "off"
  - `invalid` — the word is *not* a recognised boolean word (caller must treat this as a hard error, not a silent default)
- **Recognised on-words** — `1`, `true`, `yes`, `on`
- **Recognised off-words** — `0`, `false`, `no`, `off`
- **Prototype-pollution guards** — explicit cases for `constructor` and `__proto__` confirm these lookups do not leak inherited object keys.

## Relationships
No graph neighbours are recorded for this file. It is a leaf data file consumed by whatever test-runner loads `.cases.yaml` fixtures.

## Notes
- Parsing is **trimmed and case-insensitive**; no other normalisation is applied.
- `invalid` is a *distinct* sentinel from `false`. The header comment stresses that a set-but-unrecognised value is a **boot error**, never a silent fallback to a default. Blank/whitespace-only strings also resolve to `invalid`; the "blank means unset" interpretation is handled one layer above this parser.
- The accepted vocabulary is intentionally small and fixed (`1/0/true/false/yes/no/on/off`). Common alternatives like `enabled`, `y`, `n`, `t`, and `null` are explicitly rejected so that a caller cannot rely on broader libraries (e.g. `yargs`, `dotenv-expand`) to interpret them.
- Because the file is pure YAML data with no code, changes here only take effect when the consuming test suite is re-run; there is no build step or import to update.
