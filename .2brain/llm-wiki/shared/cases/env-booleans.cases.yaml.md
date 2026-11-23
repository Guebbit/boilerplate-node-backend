---
source: shared/cases/env-booleans.cases.yaml
source_sha256: 457aaeca2cafb993cf2c6361d2c8f14e4a3843f5ecfc746b6d547eaf7c94f46d
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T02:21:14.463469+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/cases/env-booleans.cases.yaml

## Purpose
A shared, data-only table of test cases defining how a single word is read as a boolean when it comes from an environment variable, a query string or a form field. Each case gives an input `word` and the expected result, so every implementation can be checked against the same rules. The header comment states that matching is trimmed and case-insensitive.

## Key elements
- `cases:` is the top-level list. Each entry is `{ name, word, expect }`.
- `expect: true` covers the on-words `1`, `true`, `yes` and `on`. Mixed case (`TrUe`, `YES`) and surrounding whitespace (`"  On \t"`) are also on.
- `expect: false` covers the off-words `0`, `false`, `no` and `off`. Upper case (`FALSE`) and padded forms (`' No '`) are also off.
- `expect: invalid` means "not a boolean word". It covers:
  - empty or blank-only input (`''`, `'   '`)
  - short forms (`y`, `n`, `t`)
  - other numbers (`2`, `-1`)
  - other words (`enabled`, `null`)
  - a typo (`truee`)
  - inherited object keys (`constructor`, `__proto__`)

## Relationships
No graph neighbors. The file has no dependencies listed, and nothing in the provided content references it. It is a standalone fixture that a test runner or parser would load.

## Notes
- The header comment says `invalid` is not a silent default. A set-and-wrong environment value is a boot error.
- The same comment says a blank value counts as unset one layer above this parser. This file still lists blank and whitespace-only words as `invalid`, so that handling is outside what these cases define.
- Only the exact words above are accepted. There is no fuzzy matching, so short forms like `y` and typos like `truee` are rejected.
- The `constructor` and `__proto__` cases guard against implementations that look words up in a plain object, where inherited keys could be mistaken for valid entries.
