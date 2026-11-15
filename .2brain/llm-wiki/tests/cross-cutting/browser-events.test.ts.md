---
source: tests/cross-cutting/browser-events.test.ts
sha256: 6a898e8ada6d7123b8c541f760be22e3287b571d50b6926719f4281ffb165a4c
generated_at: 2026-11-14T23:01:58.847576+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/browser-events.test.ts

## Purpose

Cross-cutting consistency test that verifies, for every deployed module, the browser event names declared in its `openapi.browser-events.yaml` fragment exactly match the keys on its `AppModule.browserEvents` manifest field. It guards against the two declarations silently diverging (a name only in the fragment is silently dropped; a name only on the manifest is unreachable).

## Key elements

- **`declaredBy(moduleName)`** — Reads `<MODULES_ROOT>/<name>/openapi.browser-events.yaml`, parses it, and returns the flat list of event names from all `components.schemas.*.properties.event.enum` arrays. Returns `undefined` if the file does not exist.
- **`describe('browser events: …')`** — Filters `enabledModules` down to "owners" (modules where either `browserEvents` is set on the manifest *or* a fragment file exists).
- **Canary `it`** — Asserts `owners.length > 0` is equivalent to `isDeployed('products')`. Serves as a sentinel: if this passes but per-owner checks are skipped, the cause is "none deployed," not "fragment unread."
- **`it.each` per-owner test** — For each owner, asserts `Object.keys(appModule.browserEvents ?? {}).toSorted()` equals `declaredBy(name) ?? [].toSorted()`. Conditionally registered (guarded by `owners.length > 0`) because `it.each` rejects an empty table.

## Relationships

- **`src/modules.ts`** — Provides `enabledModules`, the iterable of deployed `AppModule` instances that the test filters and iterates over.
- **`tests/support/paths.ts`** — Provides `MODULES_ROOT` (base directory for locating each module's fragment YAML) and `isDeployed` (used in the canary assertion).

## Notes

- The `it.each` is wrapped in `if (owners.length > 0)`; without this guard, an empty owner list would cause `it.each` to throw at collection time.
- Both sides are compared with `.toSorted()` to make the assertion order-independent.
- The canary test is deliberately tied to the `products` module as a known event-declaring module; if `products` is not deployed, the entire `it.each` block is absent and only the canary runs.
