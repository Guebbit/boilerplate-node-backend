---
source: src/modules/delivery/config.ts
source_sha256: 4f834807d3a95beb24ed970fcac7a619c1580db87895de7998e7902801d3daf7
context_sha256: 7f98b385f4524c01f86805a3296f80599eaaf29f1ec11a7251710612ede813d8
generated_at: 2026-11-22T04:45:06.023996+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/config.ts

## Purpose
Defines the `delivery` module's configuration: the retention window for the one piece of free text it stores, staff's note on a hold. The value is read per call, so tests can vary it per case.

## Key elements
- `deliveryConfig`: config accessor built with `defineConfig({ name: 'delivery', shape })`. Its only field is `NODE_HOLD_NOTE_RETENTION_DAYS`, an `int` that defaults to 365 with a minimum of 1.
- `holdNoteRetentionDays()`: returns `deliveryConfig().NODE_HOLD_NOTE_RETENTION_DAYS` as whole days. This is how long a fulfillment order may go unchanged before `reap:delivery` unsets its `holdNote`.

## Relationships
- `src/infrastructure/config/define.ts` provides `defineConfig`, which builds `deliveryConfig`.
- `src/infrastructure/config/fields.ts` provides the `int` field helper used to declare the setting.
- `src/modules/delivery/services/retention.ts` is the likely consumer of `holdNoteRetentionDays()`. The doc comment ties the value to the `reap:delivery` job, though this file doesn't import or call it.
- `src/modules/delivery/module.ts` is a graph neighbor of this file. Nothing in this file shows how the two interact.

## Notes
- `deliveryConfig()` is called on each `holdNoteRetentionDays()` call, so the value isn't captured at import time.
- The setting is read from the `NODE_HOLD_NOTE_RETENTION_DAYS` key. The file doesn't show how `defineConfig` resolves that key (environment or otherwise).
