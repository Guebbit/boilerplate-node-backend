---
source: tests/cross-cutting/write-routes-are-guarded.test.ts
sha256: a588a4490d0024ee25f3de4cff61cde7488d4be3cff98b7343f2e8d20475ff7a
generated_at: 2026-11-14T23:09:21.225632+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/write-routes-are-guarded.test.ts

## Purpose

App-wide invariant test: every write route (POST, PUT, PATCH, DELETE) across every routed module must be authenticated and behind a `requirePermission` key unless explicitly listed in `WRITE_EXCEPTIONS`. It exists because per-module `routes.test.ts` suites only enforce authorization locally; a new module without its own test file would be guarded by nothing. This file states the property once, for all modules, so new modules inherit the guarantee automatically.

## Key elements

- **`WRITE_METHODS`** — `Set` of the four state-changing HTTP methods this guard applies to.
- **`WriteException`** (interface) — shape of a single exception entry: `requiresAuth: boolean` and `reason: string`.
- **`WRITE_EXCEPTIONS`** — `Record<string, WriteException>` keyed by `` `${module} ${METHOD} ${path}` ``. Every write route that deliberately skips the identity guard, the permission key, or both. Each entry carries a human-written justification.
- **`jest.mock` blocks** — stub out the `cache`, `route-flag`, `upload`, and `rate-limit` middlewares using helper factories re-exported from `@tests/routes` so the test can inspect guard wiring without real middleware side-effects.
- **Imports from `@tests/routes`** — `effectiveRouteTable`, `guardsOn`, `identityGuardIndex` (the inspection API used to read a module's router and classify its middleware).
- **Imports from `@tests/routed-modules`** — `ROUTED_MODULES`, the list of every module that exposes an Express `Router`.
- **Imports from `@tests/paths`** — `MODULES_ROOT`, filesystem root used to locate module routers on disk.

## Relationships

- **`tests/support/routes.ts`** — Primary dependency. Supplies the route-table inspection helpers (`effectiveRouteTable`, `guardsOn`, `identityGuardIndex`) and the four middleware mock factories (`cacheMock`, `routeFlagMock`, `storageMock`, `securityMock`) that this file reuses to isolate guard wiring from real middleware side-effects.
- **`tests/support/routed-modules.ts`** — Provides `ROUTED_MODULES`, the enumeration of all modules this test iterates over.
- **`tests/support/paths.ts`** — Provides `MODULES_ROOT`, the filesystem root this test uses to resolve module directories from disk.

## Notes

- `WRITE_EXCEPTIONS` is intentionally **long**, not a short allowlist. Most writes in the app are user-scoped (cart, wishlist, address book, session management) and need a session but not a permission key; only a handful need no session at all (login, signup, token-confirmed links).
- `requiresAuth: false` is reserved for two cases only: the route runs before a session can exist, or a token *in the request* is itself the credential. Every other exception is `requiresAuth: true` (authenticated but keyless).
- Adding a new write route to an existing module means either accepting the default (auth + permission key) or adding a `WRITE_EXCEPTIONS` entry with a `reason`. Omitting both will cause this test to fail.
- A new routed module that forgets to register itself in `ROUTED_MODULES` will simply not be covered by this test — the safety net is only as wide as the enumeration.
- The file content is truncated in the snapshot above; additional exception entries and the actual `describe`/`it` test body follow.
