---
source: src/modules/locales/tests/unit/routes.test.ts
sha256: cd70ca6eb538d5052caee018aaec354b9afac235ca9c3ff15cfc0841224e302a
generated_at: 2026-09-23T18:54:18.170145+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/routes.test.ts

## Purpose

Asserts the structural contract of the locales Express router: which endpoints exist and in what order, which guards each route carries, and how caching is configured. The assertions are written as _pinned decisions_—public reads are intentionally unguarded, and admin routes self-declare their guard chain—so that "refactoring" either convention fails the suite rather than silently changing behavior.

## Key elements

- **`PUBLIC`** – array of the four anonymous read signatures the test suite expects to be open.
- **`ADMIN`** – array of all admin/translation write-and-read signatures that must carry the full three-guard chain.
- **`TRANSLATIONS`** – subset of ADMIN for the two `/translations/:entityType/:id` routes, treated separately because they clear a registry-declared cache tag in-service rather than via route middleware.
- **`describe("…what is mounted")`** – verifies the exact route signature list and that `/tenants` precedes `/:locale` (Express first-match ordering).
- **`describe("…authorization")`** – per-route checks that public reads have no identity/permission guard; that `GET /` carries `getAuth` but not an identity guard; that every admin route declares `getAuth → identity → requirePermissionGuard` in that order; and a sweep that no route is left ungoverned.
- **`describe("…caching")`** – verifies public reads use `setCache(3600…)` with `tags: ['locales']` and `browserRevalidate: true`; that the editing/translation routes are uncached; that remaining admin writes call `invalidateCache([locales])`; and that translation routes do _not_ invalidate that tag (they clear their own registry-declared tag in-service).
- **Cache middleware mock** – `jest.mock` replaces the real `@infrastructure/http/middlewares/cache` with a mock provided by `@tests/routes`, so `chainOf` can read the declared cache calls without executing Redis.

## Relationships

- **`src/modules/locales/routes.ts`** – the system under test; its exported `router` is the sole input to every assertion in this file.
- **`tests/support/routes.ts`** – provides the inspection helpers (`routeTable`, `routeSignatures`, `guardsOn`, `optionsOf`, `identityGuardIndex`, `chainOf`) and the `cacheMock` factory. This test file is the primary consumer of that toolkit for the locales module.

## Notes

- The test does **not** send HTTP requests or spin up a server; it introspects the Express router object in-process. All assertions are against the route metadata (path, handler chain, middleware order).
- The guard-order check (`getAuth` < identity < `requirePermissionGuard`) is positional within the middleware array, not merely a membership check—reordering the chain in `routes.ts` will fail the test even if all three names are present.
- `GET /` is the only public route expected to include `getAuth` in its chain; it is _not_ expected to include an identity guard. Confusing the two in a refactor will be caught.
- The `TRANSLATIONS` routes are excluded from the "invalidates `locales` tag" assertion _and_ from the "uncached" assertion in the sense that they simply must not call `invalidateCache([locales])`; they are, however, expected to be uncached (no `setCache` in their chain).
