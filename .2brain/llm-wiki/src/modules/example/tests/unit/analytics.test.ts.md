---
source: src/modules/example/tests/unit/analytics.test.ts
sha256: eb43a738ecb59af16608e96221b2798c3b127278ceef3843e41d71a831f06346
generated_at: 2026-11-08T05:55:43.277929+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/analytics.test.ts

## Purpose

Unit test that pins the analytics event strings emitted by the example module. It exists to catch accidental renames of the string values (e.g. `example_published` → `example.published`) that would silently break Umami dashboards, since TypeScript alone cannot detect a changed string literal once the constant name is refactored.

## Key elements

- **`describe('the example analytics vocabulary')`** — top-level suite grouping the two assertions.
- **Test: "spells every event exactly as the dashboards expect"** — asserts `exampleAnalyticsEvents` deep-equals `{ EXAMPLE_PUBLISHED: 'example_published' }`, guarding the literal string values.
- **Test: "registers its events in the app-wide union"** — assigns `exampleAnalyticsEvents.EXAMPLE_PUBLISHED` to a variable typed as `AnalyticsEventMap['example']`, verifying the `declare module` augmentation is present at type-check time (a runtime `expect` on the value is the fallback).

## Relationships

- **`src/modules/example/analytics.ts`** — the SUT; exports the `exampleAnalyticsEvents` constant whose keys/values this test locks down.
- **`src/infrastructure/observability/analytics/index.ts`** — provides the `AnalyticsEventMap` type used in the second test to confirm the module-level augmentation lands in the shared union.

## Notes

- The second test's type assertion (`AnalyticsEventMap['example']`) is only meaningful at **compile time**; if the `declare module` augmentation is removed, the project still compiles in isolation but fails when the full app type-checks. The runtime `expect(event).toBe(...)` is a safety net, not the primary guard.
- The convention (stated in the file's module docblock) is: **constant names are free to refactor, string values are fixed**. Any rename of the literal must be coordinated with the Umami dashboard configuration.
