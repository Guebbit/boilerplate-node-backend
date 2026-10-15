---
source: tests/cross-cutting/write-routes-are-guarded.test.ts
sha256: 1a693317b93b1e998042a586bacca639ff5d6999448106c09b5c21236b7bf7e4
generated_at: 2026-10-15T12:42:17.400021+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/write-routes-are-guarded.test.ts

## Purpose

App-wide cross-cutting test that asserts every write route (POST, PUT, PATCH, DELETE) across all routed modules is authenticated and behind a `requirePermission` key by default. It exists so a new module inherits this guarantee automatically—rather than requiring each module to restate the invariant in its own `routes.test.ts`—and so any deliberate exemption is recorded in one central, reasoned list.

## Key elements

- **`WRITE_METHODS`** — A `Set` of the four state-changing HTTP methods this guard applies to.
- **`WriteException`** — Interface for an exempt-route entry: `{ requiresAuth: boolean; reason: string }`. `requiresAuth: false` means no session at all; `true` means authenticated but deliberately keyless.
- **`WRITE_EXCEPTIONS`** — The registry of all exempt write routes, keyed as `` `${module} ${METHOD} ${path}` ``. Each entry carries a human-written `reason`. This is the single place every deliberate exception is listed.
- **`writesOn(router)`** — Helper that calls `effectiveRouteTable` and filters to write methods, returning an array of `` `${METHOD} ${path}` `` signatures.
- **`describe('every write route is guarded by default')`** — The test block. Visible tests include:
  - *Module coverage*: asserts `ROUTED_MODULES` keys match the set of directories under `MODULES_ROOT` that contain a `routes.ts`, so a new module cannot slip past the guard.
  - *No stale exceptions*: asserts every `WRITE_EXCEPTIONS` key for a deployed module still corresponds to a mounted write route.
  - A per-module loop (truncated) that checks each write route's middleware chain for the expected guards.
- **Jest mocks** (cache, route-flag, upload, rate-limit) — Wired through mock factories exported from `@tests/routes` to keep the route-table inspection pure.

## Relationships

- **`tests/support/paths.ts`** — Provides `MODULES_ROOT`, the filesystem path scanned to discover all module directories that define a `routes.ts`.
- **`tests/support/routed-modules.ts`** — Provides `ROUTED_MODULES`, the map from module name to its mounted Express `Router`. This is the subject of every assertion in this file.
- **`tests/support/routes.ts`** — Provides `effectiveRouteTable`, `guardsOn`, and `identityGuardIndex` used to inspect a router's middleware chain, as well as the `cacheMock`, `routeFlagMock`, `storageMock`, and `securityMock` factories consumed by the `jest.mock` declarations.

## Notes

- `WRITE_EXCEPTIONS` is intentionally large: most writes are user-scoped (wishlist, address book, session management) rather than staff actions, so the list is "every write that deliberately needs no key" plus a handful that need no session. It is not a short allowlist.
- `requiresAuth: false` is reserved for two specific patterns: no session exists yet (login, signup, password-reset request) or a token in the request body/header is itself the credential (emailed confirm/reset/verify links, payment-provider webhook, 2FA challenge step, refresh-token minting).
- The stale-exception test only validates keys whose module name appears in `ROUTED_MODULES`; a module removed at build time (e.g. via `demo:remove`) is silently skipped.
- Adding a new write route without a guard will fail this suite on the first run, even if the module has no `routes.test.ts` of its own.
