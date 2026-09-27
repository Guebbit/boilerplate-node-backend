---
source: src/modules/locales/tests/unit/routes.test.ts
sha256: 819ee90a4435fb55551a1ed5e1cf03d1b2c2a66ce44e8eae8ba3e27c49347d9f
generated_at: 2026-09-27T15:03:38.391938+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/routes.test.ts

## Purpose

Unit tests for the locales router that lock down three invariants: the exact set and order of mounted routes, the per-route authorization guard chain, and the caching strategy. Each assertion exists so that a well-intentioned "fix" (adding a router-level auth gate, reordering routes, changing cache tags) fails loudly rather than silently breaking anonymous clients, Express first-match routing, or translator feedback loops.

## Key elements

- **`PUBLIC`** – array of the four unauthenticated read signatures (`GET /`, `GET /tenants`, `GET /:locale/messages`, `GET /:locale`).
- **`ADMIN`** – array of all write/entry/translation signatures that require `getAuth` + identity guard + `requirePermissionGuard`.
- **`TRANSLATIONS`** – subset of `ADMIN` (the three `/translations/:entityType/:id` routes) that are uncached and clear their own registry-declared cache tag inside the service rather than via route-level `invalidateCache`.
- **`describe('what is mounted')`** – asserts the full signature list in order and that `/tenants` appears before `/:locale` (Express first-match).
- **`describe('authorization')`** – verifies public routes carry no identity/permission guard, that `GET /` has `getAuth` but no identity guard (optional auth), that every `ADMIN` route names all three guards in the correct order, and that no route is left ungoverned.
- **`describe('caching')`** – verifies public routes use `setCache(3600…)` with `tags: ['locales']` and `browserRevalidate: true`; that entry-list and translation routes are uncached; that all other admin routes call `invalidateCache([locales])`; and that translation routes do *not* invalidate the `locales` tag.
- **`jest.mock` for `@infrastructure/http/middlewares/cache`** – replaced via `cacheMock()` from the shared test support so assertions can inspect the chain without a live Redis.

## Relationships

- **`src/modules/locales/routes.ts`** – the module under test; the file imports its `router` export and inspects every mounted handler's middleware chain.
- **`tests/support/routes.ts`** – supplies the route-introspection helpers (`routeTable`, `routeSignatures`, `guardsOn`, `optionsOf`, `identityGuardIndex`, `chainOf`) and the `cacheMock` factory used to stub the cache middleware.

## Notes

- **Route ordering is a contract.** `GET /tenants` must precede `GET /:locale`; reversing them makes `/tenants` match as a locale lookup and 404. The test asserts the index ordering, not just membership.
- **`GET /` is deliberately the only public route with `getAuth`.** It still has no identity guard, so anonymous calls succeed; the guard is optional and lets the manifest branch on caller role.
- **Translation routes clear their cache tag in the service layer**, not via `invalidateCache` middleware, because the tag name varies with `entityType` and the fixed-tag middleware cannot express that. The test explicitly asserts the *absence* of `invalidateCache([locales])` on those routes to prevent a "helpful" refactor from adding it.
- **The "no ungoverned route" sweep** (`describe('authorization')` → last `it`) is the safety net for future additions: with no router-level gate, a new mount is unguarded by default, and this test is what would catch it.
