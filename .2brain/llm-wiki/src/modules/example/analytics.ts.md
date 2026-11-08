---
source: src/modules/example/analytics.ts
sha256: 934735631a7a2fa9594ae50ca1966f0cdc4679cb79b283d6e0bcd7918ea00675
generated_at: 2026-11-08T05:47:39.080149+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/analytics.ts

## Purpose

Declares the analytics event names that the *example* module fires, and registers them into the app-wide `AnalyticsEventMap` union via TypeScript module augmentation. The single event, `example_published`, is emitted when a publish lands. The event names themselves are sourced from a generated file (`rules.generated.ts`) derived from `rules.yaml`.

## Key elements

- **`exampleAnalyticsEvents`** (re-exported from `./rules.generated`) — a const object mapping event keys to their canonical string values (e.g. `example_published`). Generated from `rules.yaml`; do not edit by hand.
- **`declare module '@infrastructure/observability/analytics'`** — module augmentation that adds an `example` key to `AnalyticsEventMap`, widening the app-wide union of valid analytics event names so the TS compiler can check emit call-sites.

## Relationships

- **`src/modules/example/services/transition.ts`** — the call-site that invokes `emitAnalyticsEvent` with the `example_published` name defined here. If this file is deleted, the corresponding `emitAnalyticsEvent` call in transition.ts must also be removed.
- **`src/modules/example/tests/unit/analytics.test.ts`** — unit tests that assert the event names exported by this module match expectations.

## Notes

- Event names are **generated** from `rules.yaml` into `./rules.generated`. Regenerate rather than editing the generated file directly.
- The doc comment at the top doubles as a deletion checklist: if the module no longer reports to analytics, remove both this file *and* the `emitAnalyticsEvent` call in the consumer.
- Naming conventions are documented at `docs/tools/analytics.md#naming`.
