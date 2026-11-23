---
source: shared/cases/money.cases.yaml
source_sha256: 7b7eeb2464979a97506f002ac7ef13387e6c4831efc56634cd66b6578b714fc1
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T02:21:42.662692+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/cases/money.cases.yaml

## Purpose
A shared, language-neutral table of test cases for money handling, with amounts as whole minor units. The header says the ISO 4217 exponent table itself lives in `money.ts`, and that these cases define how both sides must read it. Each case has a `name` and a `kind`, plus the inputs and expected output for that kind.

## Key elements
The header documents seven case kinds, all under the top-level `cases:` list:

- **`exponent`** (`currency` → `exponent`): decimal places per currency. The default is 2. JPY, KRW and ISK are 0, KWD and BHD are 3, IQD is 3, CLF is 4. Unlisted codes (`XXX`) and lowercase codes (`jpy`) get 2.
- **`minor-text`** (`value`, `currency` → `minor`): converts decimal text to minor units by moving digits, never through floats.
  - It rounds half away from zero on the first dropped digit only. Examples: `1.005` → 101, `-19.995` → -2000.
  - `-0` and `-0.00` give 0.
  - Only plain `-?digits[.digits]` takes this path. `.5` and `1e3` are read as numbers. `abc` and an empty string give 0.
- **`minor-number`** (numeric `value`, `currency` → `minor`): `round(value * 10^exponent)`, with half rounding toward +infinity. For example, -0.5 JPY → 0. NaN, ±Infinity and negative zero give 0.
- **`decimal`** (`minor`, `currency` → `decimal` text): converts back to API text padded to the currency's places. Examples: `19.99`, `1999` for JPY, `-19.99`, `0.00`.
- **`fits`** (`amount` text, `currency` → boolean `fits`): true if the text has no more places than the currency allows. `NaN` and `Infinity` never fit.
- **`apportion`** (`total`, `weights` → `shares`): floors every share, then gives the leftover to the largest weight, or to the first one on a tie.
  - All-zero weights, a zero total and empty weights give zeros or an empty list.
- **`scale-by-rate`** (`amount`, `rate` → `result`): `round(amount * rate)`, with half rounding toward +infinity. For example, -505 × 0.5 → -252. A non-finite rate gives 0.

## Relationships
The graph lists no neighbors for this file. The header only mentions the exponent table and "both sides" in prose; it names no loader or test runner.

## Notes
- HUF, IDR, COP, PKR and LBP are 2 here although CLDR (`Intl`) says 0. IQD is 3 where CLDR says 0. MGA is also 2 where CLDR says none. Do not "correct" these to CLDR values.
- Currency lookup is case-sensitive.
- The `minor-text` and `minor-number` rounding rules differ. Text rounds half away from zero. Numbers round half toward +infinity. The same input can therefore give different results for negative halves.
- The file is Prettier-style YAML with flow-mapping entries and 4-space indentation.
