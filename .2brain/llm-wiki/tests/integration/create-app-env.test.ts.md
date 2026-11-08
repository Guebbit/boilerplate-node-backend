---
source: tests/integration/create-app-env.test.ts
sha256: cdc07d9b6cd72c8b98eef4fff37f3c3c7ca3ab2bf9d4c3555fdb4fdadea5c07f
generated_at: 2026-11-08T09:37:32.785077+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/create-app-env.test.ts

## Purpose

Integration tests verifying the `createApp({ env })` injection contract: the supplied environment object is what the app's config actually reads, `process.env` is never mutated as a side effect, the real boot-gate validation still applies to injected values, and injecting `undefined` resets a variable back to its default.

## Key elements

- **`describe('createApp({ env })')`** — the single test suite. No setup/teardown; each test is self-contained.
- **Test: "makes the injected value what the app slice reads"** — calls `createApp({ env: { NODE_JSON_BODY_LIMIT: '7kb' } })` then asserts `appConfig().NODE_JSON_BODY_LIMIT` equals `'7kb'`.
- **Test: "leaves process.env alone"** — injects a value and asserts `process.env` does **not** pick it up.
- **Test: "refuses to build on an injected value the parser refuses"** — passes a non-numeric `NODE_HTTP_HEADERS_TIMEOUT_MS` and expects a throw whose message names the variable (exercises the boot gate, not just happy-path config).
- **Test: "unsets a variable when it is injected as undefined"** — passes `undefined` for a key and asserts the config falls back to its built-in default (`'100kb'`).

## Relationships

- **`src/app.ts`** — source of the `createApp` function under test. The test is the primary integration-level specification for how `env` is consumed during app construction.
- **`src/app/config.ts`** — source of `appConfig`, the public read accessor used to assert what the config "sees" after a given `env` injection.

## Notes

- The test does **not** mock or spy on `createApp` or `appConfig`; it exercises the real code path end-to-end, which is why the file lives under `tests/integration` rather than `tests/unit`.
- The "unsets" test relies on the default for `NODE_JSON_BODY_LIMIT` being `'100kb'`; if that default changes, the assertion must be updated in lockstep.
- No cleanup between tests is needed because each test injects a *new* app instance and the contract guarantees `process.env` is untouched.
