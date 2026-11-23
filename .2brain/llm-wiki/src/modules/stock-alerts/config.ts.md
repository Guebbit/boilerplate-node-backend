---
source: src/modules/stock-alerts/config.ts
source_sha256: 6ba83cd8ddb52fa2be0c8adf2081972e78e5e5720efd79e290cae6572d49d21f
context_sha256: 25f58e6f03604bd62dc524a5bdeef4158397a3f5c70e4a3d005f59d290a67f25
generated_at: 2026-11-22T07:53:30.695806+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/config.ts

## Purpose
Declares the stock-alerts module's single configuration setting: the maximum number of back-in-stock requests ("products to wait for") one account may hold at once. The cap exists because `GET /stock-alerts` is never paginated, so the limit keeps its response small.

## Key elements
- `stockAlertsConfig`: config definition built with `defineConfig`, named `'stock-alerts'`, with one field, `NODE_STOCK_ALERTS_MAX`.
  - `NODE_STOCK_ALERTS_MAX` is an `int` with default `100`, min `1`, max `250`.
- `stockAlertsMax()`: returns `stockAlertsConfig().NODE_STOCK_ALERTS_MAX`, the per-account cap as a number from 1 to 250.

## Relationships
- `src/infrastructure/config/define.ts`: supplies `defineConfig`, used to create `stockAlertsConfig`.
- `src/infrastructure/config/fields.ts`: supplies the `int` field builder used to declare the setting.
- `src/modules/stock-alerts/module.ts` and `src/modules/stock-alerts/repository.ts`: listed as graph neighbors. This file doesn't import them, and the file itself doesn't show how they use the cap.

## Notes
- The upper bound of 250 is deliberate: it keeps "never paginated" true whatever an operator sets.
- A request is deleted once answered, so a shopper rarely nears the cap.
- Other code should call `stockAlertsMax()` rather than read the config object directly.
