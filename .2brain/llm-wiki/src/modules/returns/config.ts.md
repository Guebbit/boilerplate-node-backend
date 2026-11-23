---
source: src/modules/returns/config.ts
source_sha256: 8f2a6c72bbd5364d563862bc61225ffac50f5fc7a40c261cb6e8e6223e2fd354
context_sha256: edcb8952c50a70685a21a88bca82079f8d72388e0195f3650c33b003db621e34
generated_at: 2026-11-22T07:21:09.255194+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/config.ts

## Purpose
Declares the `returns` module's configuration: how long a return's free text (`note` and `declineMessage`) is retained after its last change. The value is read on each call rather than cached at import time, following a pattern from another module's config, so tests can vary it per case.

## Key elements
- `returnsConfig`: the config accessor built with `defineConfig({ name: 'returns', shape: {...} })`. Its shape has one field, `NODE_RETURN_TEXT_RETENTION_DAYS`, an `int` with default `1095` (about 3 years) and `min: 1`.
- `returnTextRetentionDays()`: returns `returnsConfig().NODE_RETURN_TEXT_RETENTION_DAYS`. This is the number of days a return may go unchanged before `reap:returns` unsets its `note` and `declineMessage`.

## Relationships
- `src/infrastructure/config/define.ts`: provides `defineConfig`, which builds `returnsConfig`.
- `src/infrastructure/config/fields.ts`: provides the `int` field helper used to declare the env var.
- `src/modules/returns/module.ts` and `src/modules/returns/services/retention.ts`: listed as graph neighbors. This file shows no direct interaction with them. The `reap:returns` reference suggests the retention service is the consumer of `returnTextRetentionDays()`, but the file itself does not confirm this.

## Notes
- Because `returnsConfig` is called each time, the env var is resolved at call time. Callers should use `returnTextRetentionDays()` rather than storing the result.
