# src/modules/payments/config.ts

## Purpose

Provides the single deployment-tunable money setting — the default ISO-4217 currency code. It exists as a dedicated module (mirroring `@modules/inventory`'s `config.ts`) so the value is read in exactly one place, per call, rather than transcribed into each consumer's own fallback.

## Key elements

- **`defaultCurrency()`** — Returns the currency code for new payments by reading `process.env.NODE_DEFAULT_CURRENCY` at call time, falling back to `'EUR'`. Because it is a function (not a const), the env read happens on every invocation; a deploy that changes the variable takes effect on the *next* payment intent, not the next restart.

## Relationships

- **`src/modules/payments/service.ts`** — Calls `defaultCurrency()` when stamping a new payment at intent time, so the code is baked into the record immediately and a later config change never relabels money already taken.

## Notes

- The function is intentionally **not** cached or memoised. This is the same "read per call" convention used by the inventory module's `config.ts`; adding a module-level `const` would break the no-restart change semantics.
- Because the value is stamped *at intent time*, existing payments retain the currency that was active when they were created. This is a deliberate design choice, not a bug.
- The environment variable name is `NODE_DEFAULT_CURRENCY` (note the `NODE_` prefix shared with other runtime config in this project).
