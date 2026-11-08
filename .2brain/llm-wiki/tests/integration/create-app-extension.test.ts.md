---
source: tests/integration/create-app-extension.test.ts
sha256: 0d487e39fafcb2aced1115703df553fd4fae237bb40444d279be0b95f92bb2a4
generated_at: 2026-11-08T09:37:41.676585+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/create-app-extension.test.ts

## Purpose

Integration test verifying the `extension` option of `createApp`. It confirms two properties: (1) an extension's routes are reachable (mounted ahead of the 404 catch-all), and (2) an app created without an extension exposes no extra routes. The test exercises the public `createApp({ extension })` API end-to-end via HTTP rather than inspecting internal wiring.

## Key elements

- **`describe('createApp({ extension })')`** — top-level suite; the only block in this file.
- **Test: "mounts the extension's routes ahead of the 404 catch-all"** — builds an app with an inline `extension` whose `install(extended)` callback registers `GET /__extension`, then asserts a 200 response with `{ mounted: true }`.
- **Test: "mounts nothing when no extension is passed"** — builds an app with no arguments, requests the same path, and asserts a 404.
- **`request(app)` (supertest)** — issues real HTTP requests against the Express app returned by `createApp`, giving route-ordering and middleware-chain coverage that unit tests would miss.

## Relationships

- **`src/app.ts`** — exports the `createApp` function under test. The test calls it with and without the `extension` option and consumes the returned `app` (an Express instance) for supertest requests. No other symbols from `src/app.ts` are used.

## Notes

- The extension contract visible here is minimal: `{ install: (extended) => void }`. The `extended` parameter is expected to expose Express-style methods (`.get`, etc.), but the test does not assert its type beyond usage.
- The file-level doc comment notes that the `afterBoot` lifecycle step is covered separately in `scenarios/demo-restore.test.ts`; this file deliberately does not test boot/listen ordering.
- The production-relevant assertion is the second test (no extension ⇒ no extra routes), not the first; the first is primarily a demo-profile sanity check.
