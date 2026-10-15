---
source: tests/cross-cutting/analytics-events.test.ts
sha256: 02a4ba029022f233f28397cdb984ca2bdd15127aa01512269ab10a6b9e9cbf5d
generated_at: 2026-10-15T12:34:51.685871+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/analytics-events.test.ts

## Purpose

Cross-cutting test that sweeps every `src/modules/<name>/analytics.ts` file to enforce a single, collision-free analytics vocabulary. Because all event names are reported into one shared Umami website, a name claimed by two modules produces indistinguishable rows. This file is the analytics counterpart to `audit-actions.test.ts` and guards both the browser-reported names (declared per module for `POST /analytics/events`) and the server-emitted ones.

## Key elements

- **`ANALYTICS_PORT`** – the module specifier (`@infrastructure/observability/analytics`) that each module must augment with a `declare module` block to widen `AnalyticsEventMap`.
- **`listAnalyticsFiles()`** – discovers all `src/modules/<name>/analytics.ts` files by scanning `MODULES_ROOT`; returns `{ module, file }` pairs.
- **`readEvents(file)`** – dynamically imports an analytics file and locates its exported event-name map *by shape* (an object whose values are all strings), since the constant name varies per module (`accountAnalyticsEvents`, `cartAnalyticsEvents`, …). Returns an empty object if none is found.
- **Test: "finds a vocabulary in every module that declares one"** – canary: asserts the modules directory is non-empty and every discovered file exports at least one event name.
- **Test: "never lets two modules claim the same constant name"** – collects all keys across all modules; fails on duplicate constant names.
- **Test: "never lets two modules claim the same event string"** – collects all *values* across all modules; fails on duplicate event strings (the collision that actually reaches Umami).
- **Test: "spells every event as lower snake_case, subject first"** – validates every event string against `^[a-z][\da-z]*(_[a-z][\da-z]*)+$` (≥ 2 lower-snake_case segments).
- **Test: "has every module widen the port union it emits through"** – source-text check: reads each analytics file as a string and asserts it contains a `declare module '@infrastructure/observability/analytics'` block.

## Relationships

- **`tests/support/paths.ts`** – imports `MODULES_ROOT`, which is the resolved absolute path to `src/modules/`. The sweep's entire file discovery depends on this constant being correct.

## Notes

- The port-union test reads the file as **source text** (not a type-level assertion) because `declare module` augmentations are erased at runtime; a value-level check could only restate "a string is a string."
- `readEvents` deliberately imports the module for real so a broken import fails the test rather than silently contributing zero events.
- The naming regex requires at least two segments (e.g. `order_placed`), enforcing the "subject first, past-tense verb closes" convention documented in `docs/tools/analytics.md#naming`.
- See `docs/api/contract-fragmentation.md#the-analytics-names--the-bundle-that-stopped-being-one` for the design rationale behind the single-vocabulary constraint.
