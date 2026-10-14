---
source: src/modules/example/tests/unit/analytics.test.ts
sha256: eb43a738ecb59af16608e96221b2798c3b127278ceef3843e41d71a831f06346
generated_at: 2026-10-14T15:48:12.113301+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/analytics.test.ts

## Purpose

Unit test that pins the exact string values of the example module's analytics events and verifies they are registered in the app-wide `AnalyticsEventMap` union. It exists to prevent accidental string changes (which would break Umami dashboards) and to guard against the `declare module` augmentation being silently removed.

## Key elements

- **`describe('the example analytics vocabulary')`** — top-level suite grouping both assertions.
- **`it('spells every event exactly as the dashboards expect')`** — asserts `exampleAnalyticsEvents` deep-equals `{ EXAMPLE_PUBLISHED: 'example_published' }`, locking the emitted string to what Umami series keys on.
- **`it('registers its events in the app-wide union')`** — assigns the event to `AnalyticsEventMap['example']` and asserts the value; primarily a type-level check that the module augmentation is present and correct.

## Relationships

- **`src/modules/example/analytics.ts`** — source of the `exampleAnalyticsEvents` constant under test.
- **`src/infrastructure/observability/analytics/index.ts`** — provides the `AnalyticsEventMap` type used in the second assertion to confirm the module augmentation targets the right namespace.

## Notes

- The constant *names* (e.g. `EXAMPLE_PUBLISHED`) are safe to rename; the *string values* are contractual with Umami. The first test is the guard for that.
- The second test's real value is at **type-check time**: if the `declare module` augmentation in `analytics.ts` is deleted, `AnalyticsEventMap['example']` no longer exists and compilation fails. At runtime the assertion is trivial, but the type annotation is the point.
