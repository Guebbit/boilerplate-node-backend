---
source: tests/cross-cutting/write-routes-are-guarded.test.ts
sha256: 92ed0ec9020ad05fd65384800c78b5101285a1d56688ad526cfbe9cff7358ef3
generated_at: 2026-11-08T09:34:07.051216+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/write-routes-are-guarded.test.ts

## Purpose

App-wide invariant test that asserts every write route (POST, PUT, PATCH, DELETE) across **all** routed modules is protected by an identity guard and a `requirePermission` key by default. It exists because per-module `routes.test.ts` files only cover their own module—a module without its own test would be unguarded. This file states the property once for every module at once, so new modules inherit the guarantee automatically.

## Key elements

- **`WRITE_METHODS`** — `Set` of the four state-changing HTTP methods this guard applies to.
- **`WriteException`** — interface with `requiresAuth: boolean` and `reason: string`, describing a single route's exemption from the default.
- **`WRITE_EXCEPTIONS`** — `Record<string, WriteException>` keyed by `` `${module} ${METHOD} ${path}` ``. Lists every write route deliberately exempt from the `requirePermission` key (or, for a few, from authentication itself). Each entry carries a human-readable reason documenting the decision.
- **Jest mocks** (cache, route-flag, upload, rate-limit) — pulled from `@tests/routes` mock factories so middleware side-effects don't interfere with guard inspection.

## Relationships

- **`tests/support/routes.ts`** — supplies `effectiveRouteTable`, `guardsOn`, `identityGuardIndex` (used to inspect which guards sit on a route) and the four mock factories referenced in the `jest.mock` calls.
- **`tests/support/routed-modules.ts`** — supplies the `ROUTED_MODULES` list that the test iterates over to cover every module.
- **`tests/support/paths.ts`** — supplies `MODULES_ROOT`, the filesystem root used to discover module directories.

## Notes

- `requiresAuth: false` is reserved for routes where no session can exist yet (login, signup) or where a token *in the request* is itself the credential (reset links, refresh cookies, 2FA challenge tokens). All other exceptions are `requiresAuth: true`: authenticated but deliberately keyless because the write is scoped to the caller's own resource (cart, wishlist, address book, profile, etc.).
- The exception list is intentionally large and is **not** a short staff-action allowlist. Adding a new keyless write route requires adding an entry here with a reason.
- Per-module `routes.test.ts` files still matter for mount order, cache tags, and upload fields; this file does not replace them. It only covers the one cross-cutting property they would each need to restate.
