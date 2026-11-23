---
source: src/modules/shop-tasks/config.ts
source_sha256: a814e77c804f0587dff222f653b5e58b1d5245d7457336eb4a7a17a108ab937f
context_sha256: f23eab58ee18625f89db7f1e8fbcb6df1f49d48466932b6bd35887552ecddc97
generated_at: 2026-11-22T07:40:36.237242+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/config.ts

## Purpose
Declares the configuration for the `shop-tasks` module: the thresholds (in hours or days) that control how long an item waits before the daily staff digest counts it. Each threshold is an integer setting with a default and a minimum.

## Key elements
- `shopTasksConfig`: the module's config, built with `defineConfig` under the name `'shop-tasks'`. Its shape has these keys (all `int`):
  - `NODE_STAFF_TRANSFER_DUE_HOURS`: default 24, min 1
  - `NODE_STAFF_HOLD_OPEN_DAYS`: default 3, min 1
  - `NODE_STAFF_RETURN_DECISION_DAYS`: default 3, min 1
  - `NODE_STAFF_RETURN_TRANSIT_DAYS`: default 7, min 0
  - `NODE_STAFF_UNSHIPPED_DAYS`: default 3, min 1
  - `NODE_STAFF_TRACKING_MISSING_HOURS`: default 24, min 1
  - `NODE_DELIVERY_UNDELIVERED_REMINDER_DAYS`: default 14, min 1

## Relationships
- Uses `defineConfig` from `src/infrastructure/config/define.ts` to create the config object.
- Uses the `int` field helper from `src/infrastructure/config/fields.ts` to declare each setting.
- `src/modules/shop-tasks/module.ts` and `src/modules/shop-tasks/services/digest.ts` are neighbors in the dependency graph. They are likely consumers of `shopTasksConfig`, but this file doesn't show how they use it.

## Notes
- `NODE_STAFF_RETURN_TRANSIT_DAYS` is the only setting that allows 0. The rest have a minimum of 1.
- The key names are in environment-variable style (`NODE_*`). The file doesn't show how they are loaded.
