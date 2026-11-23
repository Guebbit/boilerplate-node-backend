---
source: src/modules/example/analytics.ts
source_sha256: 00db26b2728651d5eedd29702c40e4b211ccd41a44a73d4f1db09f9e2076df9b
context_sha256: 943cd186da73892f622f31dacbed0bf6000528aa5339321246809057b75a6e86
generated_at: 2026-11-22T05:06:10.431239+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/analytics.ts

## Purpose
Declares the analytics event names the `example` module fires. It augments the analytics port's name map so the app-wide event-name union grows when this module is enabled. The module currently has one event, `example_published`, fired when a publish lands. The file's header says to delete it if the module reports nothing to analytics, and to drop the `emitAnalyticsEvent` call along with it.

## Key elements
- `exampleAnalyticsEvents`: re-exported from `./rules.generated`. The header says the names are generated from `rules.yaml`.
- `declare module '@infrastructure/observability/analytics'`: a module augmentation that adds an `example` key to `AnalyticsEventMap`. Its type is the union of the values of `exampleAnalyticsEvents`.

## Relationships
- `src/modules/example/services/transition.ts`: not visible in this file. The header refers to an `emitAnalyticsEvent` call that fires `example_published`, so that call is presumably in this neighbor, but the file content doesn't confirm it.
- `src/modules/example/tests/unit/analytics.test.ts`: the unit test for this file. Its contents are not shown here.

## Notes
- The file contains no runtime logic. It only re-exports constants and extends a type.
- It imports `exampleAnalyticsEvents` from `./rules.generated` and also re-exports it. The import is needed so `typeof` can be used in the augmentation.
- The augmentation targets `AnalyticsEventMap` in the analytics port, `@infrastructure/observability/analytics`.
- Edit event names in `rules.yaml`, not here, since the names are generated.
