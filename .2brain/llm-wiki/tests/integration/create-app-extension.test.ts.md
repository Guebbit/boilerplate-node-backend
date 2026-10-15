---
source: tests/integration/create-app-extension.test.ts
sha256: 0d487e39fafcb2aced1115703df553fd4fae237bb40444d279be0b95f92bb2a4
generated_at: 2026-10-15T12:47:06.567082+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/create-app-extension.test.ts

## Purpose

Integration test verifying that `createApp({ extension })` mounts extension-supplied routes before the 404 catch-all, and that omitting the extension option results in no extra routes being registered. It guards the contract that an app built without an extension carries nothing extra.

## Key elements

- **`describe('createApp({ extension })')`** — top-level suite; no setup/teardown hooks.
- **`it('mounts the extension's routes ahead of the 404 catch-all')`** — builds an app with an `extension.install` callback that registers `GET /__extension`, then asserts a 200 + `{ mounted: true }` via `supertest`.
- **`it('mounts nothing when no extension is passed')`** — builds an app with no options, requests the same path, and asserts 404.

## Relationships

- **`src/app.ts`** — the module under test. The test imports `createApp` and exercises its `extension` option (the `install` hook that receives an extended router). No other exports from `src/app.ts` are used here.
- **`scenarios/demo-restore.test.ts`** — mentioned in the file's doc comment as covering the `afterBoot` boot-phase scenario; not imported or executed from this file.

## Notes

- The test is intentionally minimal: it does not test the demo profile's control-surface routes, only the generic extension mechanism.
- The extension contract is `{ install(extended) }`, where `extended` is expected to expose at least `.get()` (standard Express-style router). No other methods are exercised.
- `supertest` is used for HTTP assertions rather than calling the handler directly, confirming the routes are reachable through the real middleware stack (including ordering relative to the 404 catch-all).
