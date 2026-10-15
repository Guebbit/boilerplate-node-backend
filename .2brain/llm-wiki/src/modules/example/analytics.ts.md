---
source: src/modules/example/analytics.ts
sha256: dae85ccb14efd7b3dd2a9c1a1176586e2628d6622aff88279c8df4fa9248a8ed
generated_at: 2026-10-15T10:29:42.175130+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/analytics.ts

## Purpose

Declares the analytics event names the example module fires and registers them into the app-wide `AnalyticsEventMap` via a TypeScript module augmentation. This is an **optional, self-contained capability file**: deleting it (and the corresponding `emitAnalyticsEvent` call in the service layer) removes the module from analytics entirely.

## Key elements

- **`exampleAnalyticsEvents`** (const, exported) — Maps intent keys to wire-level event strings. Currently a single entry: `EXAMPLE_PUBLISHED → 'example_published'`.
- **`declare module '@infrastructure/observability/analytics'`** — Augments the shared `AnalyticsEventMap` interface with an `example` key typed as the union of `exampleAnalyticsEvents` values, giving type-safe event names to all consumers.

## Relationships

- **`src/modules/example/services/crud.ts`** — Expected consumer: the module's own doc comment notes that removing this file also requires removing the `emitAnalyticsEvent` call (presumably in the CRUD service) to fully opt out.
- **`src/modules/example/tests/unit/analytics.test.ts`** — Unit test for this module (verifies event names and/or the augmentation).

## Notes

- Event-name strings must follow the convention in `docs/tools/analytics.md#naming` (e.g. lowercase snake_case).
- The `as const` on the export object is load-bearing: the augmentation relies on the literal union type to propagate exact event-name strings to all `emitAnalyticsEvent` call sites.
- No runtime code is executed by this file; it is purely a type-level registration plus a constant export.
