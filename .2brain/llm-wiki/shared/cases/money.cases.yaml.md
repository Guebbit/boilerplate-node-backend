---
source: shared/cases/money.cases.yaml
sha256: 7b7eeb2464979a97506f002ac7ef13387e6c4831efc56634cd66b6578b714fc1
generated_at: 2026-11-08T03:05:25.467459+00:00
model: ollama:qwen3.8:27b
---

# shared/cases/money.cases.yaml

## Purpose
A declarative test-case table that pins the exact contracts of every money-conversion function in `money.ts`. It is the single source of truth for expected inputs/outputs (exponent lookup, text/number → minor units, minor units → decimal text, `fits`, `apportion`, `scale-by-rate`) so that any implementation or reimplementation can be validated against the same table without re-deriving edge cases.

## Key elements
- **`exponent` cases** — currency code → integer decimal-places (0–4). Establishes the ISO 4217 table *as this project interprets it*, including deliberate overrides of CLDR (`HUF`, `IDR`, `MGA`, `IQD` → 2 or 3 where `Intl` says 0). Unlisted codes and lowercase codes default to 2.
- **`minor-text` cases** — plain decimal **text** → minor units. Digits are moved (no float), rounded half-away-from-zero on the first dropped digit. Documents that exponent form (`1e3`), leading-dot (`.5`), and non-numeric text are routed through the numeric path instead.
- **`minor-number` cases** — a JS number → minor units via `round(value × 10^exponent)`. Rounding is half-toward-+∞. Non-finite values and `−0` resolve to 0.
- **`decimal` cases** — minor units → the padded decimal string the API exposes.
- **`fits` cases** — boolean check that a decimal string does not exceed the currency's allowed places.
- **`apportion` cases** — split `total` by `weights`; floor each share, leftover assigned to the largest (first on tie) weight. Covers all-zero weights, zero total, and empty weights.
- **`scale-by-rate` cases** — `round(amount × rate)` with half-toward-+∞; non-finite rate yields 0.

## Relationships
- **`money.ts`** — the sole consumer/implementation target. Every `kind` in this file maps to a function (or internal helper) in `money.ts`; the YAML table is the acceptance spec the module must satisfy. The ISO 4217 exponent table lives in `money.ts`; these cases assert how both sides must read it.

## Notes
- **Rounding direction differs by entry point.** `minor-text` rounds half *away from zero* (`19.995 → 2000`, `−19.995 → −2000`); `minor-number` and `scale-by-rate` round half *toward +∞* (`−0.5 → 0`, `−252.5 → −252`). This is intentional and easy to conflate.
- **CLDR disagreements are deliberate.** HUF, IDR, COP, PKR, LBP (2 here vs 0 in CLDR) and IQD (3 here vs 0) are pinned by these cases. Do not "fix" them to match `Intl.NumberFormat` output.
- **The `minor-text` path is strictly regex-gated**: only `-?digits[.digits]` takes the digit-moving path. Anything else (`.5`, `1e3`, `abc`, ``) falls through to numeric parsing, which can produce surprising results (e.g. `.5 → 50`, `1e3 → 100000`).
- **Lowercase currency codes are unlisted** and fall back to exponent 2 — there is no case-insensitive lookup.
- **`apportion` leftover tie-break** is "first on a tie," not "last" or "random"; the cases `[1,1,1] → [34,33,33]` and `[1,1] → [1,0]` make this explicit.
