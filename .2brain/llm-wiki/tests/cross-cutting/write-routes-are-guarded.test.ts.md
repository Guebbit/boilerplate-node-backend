---
source: tests/cross-cutting/write-routes-are-guarded.test.ts
sha256: 2fe7122add8a0204d28653e2662d7fd4c2fb88f521d3d5bd7d3fc87a0c76ee5e
generated_at: 2026-10-29T06:51:19.188722+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/write-routes-are-guarded.test.ts

## Purpose

App-wide invariant test: every state-changing route (POST, PUT, PATCH, DELETE) must be behind both an identity guard and a `requirePermission` key, unless explicitly listed in `WRITE_EXCEPTIONS`. It exists so that a new routed module inherits the guarantee automatically instead of relying on each module to restate it in its own `routes.test.ts`.

## Key elements

- **`WRITE_METHODS`** — `Set` of the four state-changing HTTP methods the guard applies to.
- **`WriteException`** — interface with `requiresAuth: boolean` and `reason: string`; `false` means no session is needed at all (login, token-in-request, machine webhook), `true` means authenticated but deliberately keyless (caller's own resource).
- **`WRITE_EXCEPTIONS`** — the single, exhaustive record of every write route exempt from the default, keyed `` `${module} ${METHOD} ${path}` ``. Each entry carries a human-readable `reason`.
- **`writesOn(router)`** — helper that pulls all write-route signatures (`"METHOD /path"`) from an Express router via `effectiveRouteTable`.
- **`describe('every write route is guarded by default', …)`** — the test suite. Notable cases:
  - Auto-discovers every module directory under `MODULES_ROOT` that contains a `routes.ts` and asserts the set matches `ROUTED_MODULES` (minus `@`-suffixed extra mounts), so a new module cannot go unchecked.
  - Asserts no stale entries remain in `WRITE_EXCEPTIONS` (every listed route is still mounted and still a write).
  - For every write route *not* in the exception list, asserts both an identity guard and a `requirePermission` guard are present.

## Relationships

- **`tests/support/paths.ts`** — supplies `MODULES_ROOT`, the filesystem root used to enumerate module directories.
- **`tests/support/routed-modules.ts`** — supplies `ROUTED_MODULES`, the map of module name → mounted Express router that the test iterates over.
- **`tests/support/routes.ts`** — supplies `effectiveRouteTable` (flatten a router's route table), `guardsOn` / `identityGuardIndex` (inspect which middleware guards a route has), and the mock factories (`cacheMock`, `routeFlagMock`, `storageMock`, `securityMock`) used in the `jest.mock` calls to stub infrastructure middleware.

## Notes

- The exception list is the *complement* of the guard: a write not listed here **must** have both auth and a permission key. It is long by design — most writes are "own-resource" (cart, wishlist, sessions) rather than staff actions.
- `requiresAuth: false` does **not** mean unauthenticated-by-choice; it means the credential is something other than a session (emailed token, refresh cookie, provider webhook signature, or simply "no session exists yet").
- Keys containing `@` in `ROUTED_MODULES` (e.g. `name@/basePath`) represent extra mounts on an existing module, not separate modules; the discovery test filters them out.
- Infrastructure middleware (cache, route-flag, upload, rate-limit) is mocked out via `jest.mock` pointing at helper factories in `@tests/routes`, so the test inspects the guard chain without exercising those layers.
