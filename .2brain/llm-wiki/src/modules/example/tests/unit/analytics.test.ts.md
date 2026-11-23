---
source: src/modules/example/tests/unit/analytics.test.ts
source_sha256: b60ced2efb555a616d95b31dc3c90e9f1016876f00e2229b6d4e45d813c835af
context_sha256: 9d6c46e37aa9ddf7ad07da1a3ca0b778d06fe2bcb3e43617b7c6ccbf70f0dd49
generated_at: 2026-11-22T05:14:34.614070+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/tests/unit/analytics.test.ts

## Purpose
Unit test that pins the example module's analytics event vocabulary string by string. The constant's name can be refactored freely, but the emitted string values are what Umami keys its series on, so they must not change silently.

## Key elements
- **`the example analytics vocabulary` suite**: the single `describe` block containing both tests.
- **Spelling test**: asserts `exampleAnalyticsEvents` equals exactly `{ EXAMPLE_PUBLISHED: 'example_published' }`. Adding, removing, or renaming an event string fails it.
- **Union registration test**: assigns `exampleAnalyticsEvents.EXAMPLE_PUBLISHED` to a variable typed `AnalyticsEventMap['example']`, then checks it equals `'example_published'`. The real check happens at type-check time. The runtime `expect` is secondary.

## Relationships
- **`src/modules/example/analytics.ts`**: provides `exampleAnalyticsEvents`, the object under test. It is imported via the relative path `../../analytics`.
- **`src/infrastructure/observability/analytics/index.ts`**: provides the `AnalyticsEventMap` type (imported with `import type`, via the `@infrastructure/observability/analytics` alias). The module's `declare module` augmentation adds the `example` key to it, which is what the second test verifies.

## Notes
- The second test only fails at type-check, not at runtime. If the `declare module` augmentation is dropped, `analytics.ts` still compiles on its own, so only this assignment catches the omission. The test run must include type checking for that to be caught.
- Changing an event string here means dashboards keyed on the old string will stop matching.
