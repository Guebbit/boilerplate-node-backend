---
source: tests/cross-cutting/browser-events.test.ts
sha256: 7f892d72c4d01b03301c8fd1aa433dad104197de7dbbc6e3a80af77847d31fd0
generated_at: 2026-10-15T12:36:04.461767+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/browser-events.test.ts

## Purpose

Cross-cutting test that enforces agreement between a module's browser-event contract fragment (`openapi.browser-events.yaml`) and its manifest declaration (`AppModule.browserEvents`). A mismatch means the contract accepts an event the relay can't emit, or the relay declares an event the contract never admits.

## Key elements

- **`declaredBy(moduleName)`** — reads the module's `openapi.browser-events.yaml` under `MODULES_ROOT`, parses it, and returns the flat array of event names from every schema's `properties.event.enum`. Returns `undefined` if the file doesn't exist.
- **`describe('browser events: contract fragment and manifest agree')`** — filters `enabledModules` to those that have either a manifest `browserEvents` field or a fragment file, then runs:
  - A **canary test** asserting that at least one owner exists whenever the `products` module is deployed (guards against the file-reading mechanism silently breaking).
  - An **`it.each` parameterized test** (only generated when ≥ 1 owner exists) that asserts `Object.keys(browserEvents).toSorted()` equals `declaredBy(name).toSorted()` per module.

## Relationships

- **`src/modules.ts`** — imports `enabledModules`, the runtime list of active `AppModule` instances whose `browserEvents` field is compared against the fragment.
- **`tests/support/paths.ts`** — imports `MODULES_ROOT` (base directory for resolving per-module fragment paths) and `isDeployed()` (to gate the canary assertion on whether `products` is present in the current environment).

## Notes

- `it.each` throws on an empty table, so the per-module check is conditionally defined inside the `describe` body rather than written unconditionally.
- Comparison is order-independent (both sides `.toSorted()`); only the set of event names matters.
- A name present only in the fragment is *accepted by the contract but silently dropped* by the relay; a name present only on the manifest is *unreachable*. The test catches both directions.
- The canary test uses `isDeployed('products')` as a sentinel: if the YAML file simply can't be read, `owners` will be empty and this assertion fails, distinguishing "no module declares events" from "the reader is broken."
