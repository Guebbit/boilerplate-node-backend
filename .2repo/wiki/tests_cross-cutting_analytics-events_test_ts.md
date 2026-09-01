# tests/cross-cutting/analytics-events.test.ts

## Purpose

Cross-cutting guard that sweeps every `src/modules/<name>/analytics.ts` to enforce a single, collision-free analytics event vocabulary. Because all events are emitted to one Umami website and the paired frontend emits no custom events, this sweep is the sole defense against duplicate or malformed event names that would produce indistinguishable rows. It is the twin of `audit-actions.test.ts`.

## Key elements

- **`MODULES_ROOT`** — Resolved path to `src/modules`, the root the sweep scans.
- **`ANALYTICS_PORT`** — The import specifier (`@infrastructure/observability/analytics`) that each module must augment to widen the event-name union.
- **`listAnalyticsFiles()`** — Discovers every `<module>/analytics.ts` by reading the directory and filtering on existence; returns `{ module, file }` pairs.
- **`readEvents(file)`** — Dynamically imports the file and locates the exported `Record<string, string>` by shape (since each module names its constant differently, e.g. `accountAnalyticsEvents`, `cartAnalyticsEvents`). A module that fails to load throws here rather than silently contributing zero events.
- **Test: "finds a vocabulary in every module that declares one"** — Canary check that the sweep actually found modules and that each declares at least one event.
- **Test: "never lets two modules claim the same constant name"** — Detects duplicate keys across all modules' event records.
- **Test: "never lets two modules claim the same event string"** — Detects duplicate *values* (the strings that actually reach Umami).
- **Test: "spells every event as lower snake_case, subject first"** — Enforces the `^[a-z][\da-z]*(_[a-z][\da-z]*)+$` naming rule.
- **Test: "has every module widen the port union it emits through"** — Source-text check that each `analytics.ts` contains a `declare module` block for `ANALYTICS_PORT`.

## Relationships

- **Reads** `src/modules/*/analytics.ts` (discovered at runtime via `readdirSync`).
- **Source-text references** `@infrastructure/observability/analytics` (the port whose `AnalyticsEventMap` union each module must augment).
- **References** `docs/api/contract-fragmentation.md#the-analytics-names--the-bundle-that-stopped-being-one` and `docs/tools/analytics.md#naming` as design rationale.

## Notes

- No graph neighbors are registered for this file; it is a leaf test that only *reads* other modules.
- The `readEvents` helper identifies the export **by shape** (an object whose values are all strings), not by a known property name — this is why adding a second string-record export to an `analytics.ts` would break the test.
- The port-union test reads the file as **text** rather than asserting at the type level, because `declare module` augmentation is erased at runtime.
- The canary assertion (`files.length >= 1`) guards against a broken `MODULES_ROOT` path producing a vacuously-passing sweep.
