---
source: src/app/routes.ts
sha256: 90e8d2aa7b1d2a8c3c9847d54891f8c6f76f7a344cd57930e91a5e928c3de2d0
generated_at: 2026-09-27T14:02:46.980573+00:00
model: ollama:qwen3.8:27b
---

# src/app/routes.ts

## Purpose

Single entry point for wiring all HTTP routes onto the Express app. It mounts each domain module's router at the base path that module's own manifest declares, adds the system-level root ping, and closes with a 404 catch-all — all without importing or referencing any specific domain by name.

## Key elements

- **`installRoutes(app: Express): void`** — the sole export. Called once during app setup. Performs three steps in order:
  1. Iterates `enabledModules` and calls `app.use(basePath, routes)` for each module that provides both a `basePath` and a `routes` router. Modules missing either are silently skipped (e.g. `access`, which holds data but exposes no URLs).
  2. Mounts `systemRoutes` at `'/'` for the root ping.
  3. Registers an inline 404 handler that calls `rejectResponse(response, 404)`.

## Relationships

- **`src/modules.ts`** — provides the `enabledModules` array that drives the loop. This file is domain-agnostic; it knows nothing about which modules are enabled.
- **`src/app/system-routes.ts`** — supplies the `systemRoutes` router for the root ping. The only explicitly imported route source (as opposed to being discovered via the module manifest).
- **`src/infrastructure/http/response.ts`** — source of `rejectResponse`, used by the 404 catch-all.
- **`src/app.ts`** — the caller that invokes `installRoutes(app)` during Express app construction.
- **`tests/integration/app/demo-routes.test.ts`** — integration tests that exercise the mounted routes end-to-end.

## Notes

- The 404 handler lives here (not in a separate error-handling install) deliberately: it must be the **last** route registered. If it were installed independently, a later module mount could be registered after it and become unreachable.
- A module manifest that carries `basePath` but no `routes` (or vice versa) is skipped, not errored — the file treats a half-configured manifest as "nothing to mount."
- The system-routes import is the one hard-coded, domain-specific dependency in an otherwise fully data-driven install. Everything else flows from the `enabledModules` manifest.
