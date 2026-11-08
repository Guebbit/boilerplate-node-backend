---
source: src/modules/antibot/module.ts
sha256: c96ef450daefc90697ecb2ff3b27299940d1ba0943428a86a350b0268ac6933b
generated_at: 2026-11-08T05:00:22.961807+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/module.ts

## Purpose

Module manifest for the **antibot** module. It declares the module's name, HTTP mount point, and data classification so the kernel can discover and wire it into the app. It does **not** implement the anti-automation gate itself — that is cross-cutting middleware (`humanChallengeGate`) living elsewhere. This file exists purely as a registration record.

## Key elements

- **Default export** — An object satisfying `AppModule`:
  - `name: 'antibot'`
  - `mounts` — a single entry mounting the imported `router` at base path `/antibot`
  - `personalData: 'none'` — signals no user data is stored or persisted by this module
- **`router` import** — pulled from `./routes`; the only runtime dependency this manifest carries.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that the default export satisfies (compile-time contract only; no runtime call).
- **`src/modules/antibot/routes.ts`** — source of the `router` instance mounted at `/antibot`; contains the actual route handlers.
- **`src/modules/antibot/openapi.yaml`** — OpenAPI specification documenting the HTTP surface exposed by the routes mounted here.
- **`src/modules.ts`** — the central module aggregator that imports this manifest and collects it into the app's module list.

## Notes

- The functional gate (`humanChallengeGate`) is middleware, not a route in this module. Downstream consumers (`account`, `tasks`) depend directly on `infrastructure/adapters/antibot-providers`, bypassing this manifest entirely.
- No boot-time or health checks live here. Provider selection and secret validation are handled by `app/config.ts`, ensuring the gate remains active even if this module's routes are unmounted.
- The module is intentionally stateless — the comment notes the caller "by construction, has no account yet," so no persistence or collection entries are declared.
