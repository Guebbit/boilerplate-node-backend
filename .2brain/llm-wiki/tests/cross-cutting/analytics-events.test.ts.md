---
source: tests/cross-cutting/analytics-events.test.ts
sha256: 707bfb90a3cd27af2e7ab122b4670f2e7da90e60f748a9a956732575acf1228c
generated_at: 2026-09-23T19:52:48.346196+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/analytics-events.test.ts

## Purpose

Cross-cutting guard that sweeps every `src/modules/*/analytics.ts` file to ensure the analytics event vocabulary remains globally unique and well-formed. Because all names flow into a single Umami website keyed by string, a name claimed by two modules produces indistinguishable rows; the paired frontend emits no custom events, so this test is the sole enforcement mechanism.

## Key elements

- **`listAnalyticsFiles()`** — Discovers every `src/modules/<name>/analytics.ts` by reading the modules directory at runtime; returns `{ module, file }` pairs.
- **`readEvents(file)`** — Dynamically `import()`s the module and locates its event-name map "by shape" (the exported object whose values are all strings). Import failure causes a test failure rather than a silent zero contribution.
- **`'finds a vocabulary in every module that declares one'`** — Canary: asserts the modules directory is non-empty and every discovered file exports at least one event name.
- **`'never lets two modules claim the same constant name'`** — Checks that no object key (e.g. `checkout_completed`) appears in more than one module's map.
- **`'never lets two modules claim the same event string'`** — Checks that no event *value* (the string actually sent to Umami) is shared across modules.
- **`'spells every event as lower snake_case, subject first'`** — Enforces `/^[a-z][\da-z]*(_[a-z][\da-z]*)+$/` on every event value.
- **`'has every module widen the port union it emits through'`** — Source-text scan for a `declare module '@infrastructure/observability/analytics'` block in each analytics file (type augmentations are erased at runtime, so a value-level check is impossible).

## Relationships

No graph neighbors are recorded for this file.

## Notes

- The event-name constant is found **by shape**, not by a fixed export name, because each module names it differently (`accountAnalyticsEvents`, `cartAnalyticsEvents`, …).
- The `declare module` check reads raw source text (`readFileSync`) rather than the imported value, since TypeScript module augmentations produce no runtime artifact.
- The canary assertion (`readdirSync(MODULES_ROOT).length > 0`) guards against a broken path silently passing all "no collisions" tests.
- Referenced documentation: `docs/api/contract-fragmentation.md#the-analytics-names--the-bundle-that-stopped-being-one` and `docs/tools/analytics.md#naming`.
