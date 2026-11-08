---
source: tests/cross-cutting/browser-events.test.ts
sha256: 7f892d72c4d01b03301c8fd1aa433dad104197de7dbbc6e3a80af77847d31fd0
generated_at: 2026-11-08T09:24:31.616057+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/browser-events.test.ts

## Purpose

Cross-cutting consistency test that verifies, for every deployed module, the set of browser-event names declared in its `openapi.browser-events.yaml` fragment exactly matches the keys registered on `AppModule.browserEvents` in its manifest. Exists because the two declarations are independent and a drift in either direction (missing or extra event) would silently break analytics or drop accepted requests.

## Key elements

- **`declaredBy(moduleName)`** – Reads a module's `openapi.browser-events.yaml` from `MODULES_ROOT`, parses the YAML, and returns the flat array of `event.enum` values across all schema properties. Returns `undefined` if the file does not exist.
- **Canary test (`finds an owner…`)** – Guards against the table below being vacuously true because the fragment simply stopped being read. If `products` is deployed, at least one owner must appear.
- **`it.each` block** – For each module that has *either* a fragment *or* manifest entries, asserts `Object.keys(appModule.browserEvents)` equals `declaredBy(name)`, both sorted. Skipped entirely (via the `owners.length > 0` guard) when no module declares events, because `it.each` throws on an empty table.

## Relationships

- **`src/modules.ts`** → imports `enabledModules`; iterates only modules that are currently enabled in the build, so the test scope tracks the active module set.
- **`tests/support/paths.ts`** → imports `MODULES_ROOT` (filesystem base for locating each module's YAML fragment) and `isDeployed` (used by the canary to conditionally assert).

## Notes

- The test is intentionally *asymmetric-tolerant*: a name present only in the fragment is "silently dropped" by the relay; a name present only on the manifest is "unreachable." The assertion enforces exact-set equality, so either drift fails.
- `declaredBy` assumes the YAML shape `{ components: { schemas: Record<string, { properties: { event: { enum: string[] } }> } } }` — a module that deviates from this internal schema will crash the parse rather than fail gracefully.
- The `it.each` guard (`if (owners.length > 0)`) is a Jest-specific workaround: `it.each([])` throws, so the conditional prevents a suite-level error in environments where no module declares browser events.
