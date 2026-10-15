---
source: tests/integration/create-app-env.test.ts
sha256: cdc07d9b6cd72c8b98eef4fff37f3c3c7ca3ab2bf9d4c3555fdb4fdadea5c07f
generated_at: 2026-10-15T12:47:00.079535+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/create-app-env.test.ts

## Purpose

Integration test that verifies `createApp` accepts an `env` object as an injected configuration source. It confirms that injected values are what the app's config slices actually read, that the real `process.env` is never mutated, and that validation (parsing) still runs against injected values.

## Key elements

- **`describe('createApp({ env })')`** — the single test suite; no helper functions or exports.
- **Test: "makes the injected value what the app slice reads"** — calls `createApp({ env: { NODE_JSON_BODY_LIMIT: '7kb' } })` and asserts `appConfig().NODE_JSON_BODY_LIMIT === '7kb'`.
- **Test: "leaves process.env alone"** — injects `NODE_JSON_BODY_LIMIT: '8kb'` and asserts `process.env.NODE_JSON_BODY_LIMIT` is *not* `'8kb'`, proving no side-effect on the global env.
- **Test: "refuses to build on an injected value the parser refuses"** — passes an invalid `NODE_HTTP_HEADERS_TIMEOUT_MS: 'soon'` and expects `createApp` to throw with a message matching `/NODE_HTTP_HEADERS_TIMEOUT_MS/`.
- **Test: "unsets a variable when it is injected as undefined"** — injects `NODE_JSON_BODY_LIMIT: undefined` and asserts the config falls back to its default (`'100kb'`).

## Relationships

- **`src/app.ts`** — source of `createApp`, the function under test. The test drives its boot path by passing an `env` option and checks both its success and error behavior.
- **`src/app/config.ts`** — source of `appConfig`, the accessor the test uses to read back the effective config slice after `createApp` has run.

## Notes

- The test suite does **not** mock or spy on `process.env`; the second test asserts the absence of mutation as a behavioral guarantee rather than a side-effect cleanup.
- The `undefined`-unsets test implies `createApp` explicitly distinguishes "key present with `undefined`" from "key absent" — deleting/overwriting the prior config entry rather than simply merging.
- The validation test confirms the injected env goes through the **same** parser/gate as a real environment string (e.g., the `'soon'` value is rejected for a numeric timeout field), so the boot gate is not bypassed by injection.
