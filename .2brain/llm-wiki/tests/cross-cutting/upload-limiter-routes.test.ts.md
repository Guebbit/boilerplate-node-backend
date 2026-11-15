---
source: tests/cross-cutting/upload-limiter-routes.test.ts
sha256: da0891da9121e1dec294a8c5ba54f1ad1a94d60ea1d7f477957857b5569ffca3
generated_at: 2026-11-14T23:08:32.461836+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/upload-limiter-routes.test.ts

## Purpose

Cross-cutting integration test that sweeps every mounted route across all routed modules and asserts the upload limiter (`uploads`) is mounted **before** the upload reader (`upload.image`). Because the check reads the live route table rather than re-implementing a per-module assertion, it automatically covers any new upload route the moment its module is enabled.

## Key elements

- **`uploadRoutes(): [string, string[]][]`** — Iterates `ROUTED_MODULES`, pulls the effective route table via `effectiveRouteTable`, filters to routes whose guard chain includes `upload.image`, and returns `[module METHOD path, guards-in-mount-order]` pairs.
- **`it('finds upload routes to check')`** — Non-vacuity guard: fails if the sweep would check zero routes (prevents a silent green when the walker breaks).
- **`it.each(uploadRoutes())('%s mounts uploads before upload.image')`** — For every upload route, asserts `guards.indexOf('uploads') >= 0` and that it is strictly before `guards.indexOf('upload.image')`.
- **`jest.mock` blocks** — Stub out `cache`, `route-flag`, `upload` (storage), and `rate-limit` middlewares using mock factories exported from `@tests/routes`, so importing routers does not pull real infrastructure.

## Relationships

- **`tests/support/routes.ts`** — Source of `effectiveRouteTable`, `guardsOn`, and the four mock factories (`cacheMock`, `routeFlagMock`, `storageMock`, `securityMock`). The `jest.mock` factories call into this module to obtain the stub implementations.
- **`tests/support/routed-modules.ts`** — Provides `ROUTED_MODULES`, the canonical map of module name → router that this test walks to discover all mounted routes.

## Notes

- The limiter is identified by the guard name `'uploads'` (the middleware's route-argument name), not the file name `upload-limiter`.
- This is deliberately a single sweep test rather than per-module checks: the limiter is a wiring argument that Stryker cannot mutate, and a per-module copy would need re-adding on every new upload route.
- Mount-order semantics: `indexOf('uploads') < indexOf('upload.image')` is the contract — if a future refactor reorders guards, this test is the tripwire.
