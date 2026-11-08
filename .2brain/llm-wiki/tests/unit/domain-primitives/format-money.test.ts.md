---
source: tests/unit/domain-primitives/format-money.test.ts
sha256: 75c2f9b27dc937ef802bb03682aafc2f84dd6f0cf9db4064948677d22cc9273c
generated_at: 2026-11-08T10:03:47.657501+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/domain-primitives/format-money.test.ts

## Purpose

Unit tests for the `formatMoney` function, verifying that it formats monetary values according to a pinned ISO 4217 decimal-places table and the requested locale's number/positioning conventions, rather than relying on the runtime's CLDR currency data.

## Key elements

- **`describe('formatMoney')`** — single test suite covering five scenarios:
  - Two-decimal currency (EUR, `en`): symbol prefix, two decimal places.
  - Zero-decimal currency (JPY, `en`): no decimal places, thousands separator.
  - Three-decimal currency (KWD, `en`): three decimal places, non-breaking space (`\u00A0`) between code and amount.
  - Pinned-table override (IQD, `en`): three decimal places preserved even where CLDR would differ.
  - Locale formatting (EUR, `it`): Italian grouping/decimal separators and symbol suffix.

## Relationships

- **`src/domain-primitives/money.ts`** — the only production dependency. Imports `formatMoney` via the `@domain-primitives/money` path alias and asserts its output for a fixed set of (locale, amount, currency) tuples.

## Notes

- The file's top-level doc comment explicitly states the design intent: decimal places are sourced from a **pinned ISO 4217 table** baked into `money.ts`, not from the host environment's CLDR data. The IQD test case exists specifically to lock in that choice.
- KWD and IQD expectations use `\u00A0` (NBSP) between the ISO code and the numeric portion; a regular space would fail the assertion.
- Tests use the `describe`/`it`/`expect` API (Jest or compatible runner). The import alias `@domain-primitives/money` maps to `src/domain-primitives/money.ts` in the project's path configuration.
