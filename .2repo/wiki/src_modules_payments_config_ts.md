# src/modules/payments/config.ts

## Purpose

Single-source-of-truth for the deployment-level default currency (ISO-4217 code) stamped onto new payment documents. Extracted into its own module so that any future second consumer (price formatter, report, etc.) reads the same value instead of transcribing a second copy of the fallback.

## Key elements

- **`defaultCurrency()`** — returns `process.env.NODE_DEFAULT_CURRENCY` if set, otherwise `'EUR'`. Intentionally a function (not a module-level `const`) so the env variable is read at call time; an operator changing the variable affects the next intent, not the next process restart.

## Relationships

- **`src/modules/payments/service.ts`** — the sole current caller. Invokes `defaultCurrency()` at intent time to stamp the `currency` field on each payment document. The model in `model.ts` declares `currency` as a required field, so the function supplies the fallback only when the caller has not explicitly provided a code.

## Notes

- **No validation here.** A nonsense value in `NODE_DEFAULT_CURRENCY` is passed through verbatim. The model's `required` constraint will reject a blank string loudly; a wrong-but-present code (e.g. `"XYZ"`) is the deployment's problem, not this function's.
- **Read-per-call, not import-time.** The function form is deliberate: tests can set the env var per case without depending on import order.
- **Currency is stamped at write time**, not resolved at display time. A deployment that later changes its default does not retroactively re-denominate payments already recorded.
