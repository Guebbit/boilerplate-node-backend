---
source: tests/cross-cutting/write-routes-are-guarded.test.ts
sha256: 11756b3f5fdeb5f98b0563f18d6861c6891ada9cc63af2ff9a7ca16d5c345040
generated_at: 2026-09-27T15:53:34.099287+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/write-routes-are-guarded.test.ts

## Purpose

App-wide invariant test: every write route (POST/PUT/PATCH/DELETE) across all routed modules must be authenticated and carry a `requirePermissionGuard` by default, unless explicitly listed in `WRITE_EXCEPTIONS`. It exists so that a new module inherits the guarantee automatically rather than having to restate it in its own `routes.test.ts`.

## Key elements

- **`WRITE_METHODS`** — `Set(['POST','PUT','PATCH','DELETE'])`; the methods this guard applies to.
- **`WriteException`** — interface with `requiresAuth: boolean` and `reason: string`, describing why a route is exempt from the `requirePermissionGuard` default.
- **`WRITE_EXCEPTIONS`** — record keyed by `` `${module} ${METHOD} ${path}` `` listing every deliberately keyless write, each with a human-readable justification. This is the single canonical list of "writes that need no permission key."
- **`writesOn(router)`** — extracts all write-method route signatures from a given Express router via `effectiveRouteTable`.
- **Main `describe` block** — three assertion groups:
  1. *Import completeness*: `ROUTED_MODULES` keys match exactly the module directories that contain a `routes.ts`.
  2. *No stale exceptions*: every key in `WRITE_EXCEPTIONS` still maps to a mounted write.
  3. *Per-route guard check* (`it.each` over every write in every module): verifies identity guard + `requirePermissionGuard` ordering for non-exempt routes, or the correct relaxed guard for exempt ones.

## Relationships

- **`tests/support/paths.ts`** — provides `MODULES_ROOT`, used to enumerate module directories on disk for the import-completeness check.
- **`tests/support/routed-modules.ts`** — provides `ROUTED_MODULES`, the map of module name → mounted Express `Router`; the test iterates over it to enumerate every write route.
- **`tests/support/routes.ts`** — provides `effectiveRouteTable`, `guardsOn`, `identityGuardIndex` (the inspection primitives the assertions rely on), and the mock factories (`cacheMock`, `routeFlagMock`, `storageMock`, `securityMock`) that are wired in via `jest.mock` at the top of this file.

## Notes

- The `observability` module has zero write routes; the `it.each` loop skips it explicitly because `it.each` rejects an empty table. Any future module with no writes will need the same `continue` guard.
- `WRITE_EXCEPTIONS` is intentionally *not* a short allowlist — it enumerates **all** keyless writes (most are "the caller's own resource" patterns like cart, wishlist, address book) plus a handful that need no session at all (login, signup, webhook, token-based confirms).
- The stale-exception test means adding/removing a route without updating `WRITE_EXCEPTIONS` (or vice-versa) fails the suite, keeping the list in sync with the live router.
- Mocks for `cache`, `route-flag`, `upload`, and `rate-limit` middlewares are required so that importing routers in a test context doesn't pull in real infrastructure.
