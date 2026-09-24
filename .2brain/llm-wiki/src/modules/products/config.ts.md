---
source: src/modules/products/config.ts
sha256: 29ece356ae9d528ac66871c2a79a1c56c4ec9b34dc7fafc0229f3e8fee21e1f9
generated_at: 2026-09-23T19:25:22.044157+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/config.ts

## Purpose

Defines the two VAT rates a deployment charges (default and reduced) and validates their configuration at boot. Rates are read from environment variables on every call rather than captured at import, so a rate change takes effect on the next resolve instead of requiring a restart. This mirrors the pattern set by `inventory/config.ts`.

## Key elements

- **`vatRateDefault(): number`** — Returns the default VAT rate from `NODE_VAT_RATE_DEFAULT` (fallback `0.22`). Applied to products with no `taxClass`.
- **`vatRateReduced(): number`** — Returns the reduced VAT rate from `NODE_VAT_RATE_REDUCED` (fallback `0.1`). Applied to products whose `taxClass` is `reduced` (books, food, medicine, etc.).
- **`isValidVatRate(raw: string): boolean`** (private) — Checks that a raw env value parses to a decimal in `[0, 1)` via `parseEnvironmentDecimal`.
- **`invalidVatRateConfig(): string[]`** — Serves as this module's `customCheck`. Returns the names of env vars that are _set_ but not a valid rate (e.g. `2.2`, `abc`). Absent vars are left to the manifest's declarative `requiredConfig` check.

## Relationships

- **`src/infrastructure/runtime/environment.ts`** — Provides `environmentDecimal` (used by both rate getters) and `parseEnvironmentDecimal` (used by `isValidVatRate`).
- **`src/modules/products/tax.ts`** — The sole consumer: `resolveTaxRate` calls `vatRateDefault` / `vatRateReduced` to map a product's `taxClass` to a concrete rate. `orders` then freezes that value onto a line item.
- **`src/modules/products/module.ts`** — Registers `invalidVatRateConfig` as the module's `customCheck` so the runtime boot gate rejects malformed rates before the first request.
- **`src/modules/products/tests/unit/config.test.ts`** — Unit-tests the getter fallbacks and the validation logic.

## Notes

- Both getters are _functions_, not constants. Calling them at import time would freeze the value; the per-call read is intentional.
- `invalidVatRateConfig` only flags vars that are **present but invalid**. An unset var is already named by `requiredConfig` in the manifest; flagging it here too would be redundant.
- The validity range is `[0, 1)` — a value of `1` (100%) or higher is treated as a typo and rejected.
- `isValidVatRate` deliberately uses `parseEnvironmentDecimal` (not bare `Number`) so that edge-case strings (`.5`, `1e-1`, whitespace) are handled consistently with how the readers interpret them.
