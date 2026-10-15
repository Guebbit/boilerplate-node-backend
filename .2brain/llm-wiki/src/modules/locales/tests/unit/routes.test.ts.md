---
source: src/modules/locales/tests/unit/routes.test.ts
sha256: 86b0ae87a74ddc2be07e3f326b8e4da21302c6c931304a99ee517760d319d915
generated_at: 2026-10-15T10:48:48.096708+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/routes.test.ts

## Purpose

Unit test for the locales module's Express router. It locks in three architectural invariants so that a future refactor fails loudly rather than silently: the exact set and order of mounted routes, the per-route guard composition (public reads are ungated, admin routes self-declare all three guards), and the caching contract (shared public cache with browser revalidation, uncached editing-screen reads, and tag-based invalidation on writes).

## Key elements

- **`PUBLIC`** — The four anonymous-read routes (`GET /`, `GET /apps`, `GET /:locale/messages`, `GET /:locale`). Used as the expected set in mount-order, authorization, and cache assertions.
- **`ADMIN`** — The fourteen admin routes (CRUD on locales, per-app entries, and the `/:entityType/:id` translation endpoints). Expected to carry the full `getAuth → identityGuard → requirePermissionGuard` chain.
- **`ENTRY_READS`** / **`TRANSLATIONS`** — Two `Set` collections marking routes that are *uncached* by design (editing screens) and, for `TRANSLATIONS`, that clear a registry-declared tag inside the service rather than calling `invalidateCache(['locales'])`.
- **`describe('…what is mounted…')`** — Asserts `routeSignatures` equals `[...PUBLIC, ...ADMIN]` and that `/apps` appears before `/:locale` (Express first-match ordering).
- **`describe('…authorization…')`** — Verifies no identity guard on public reads; `GET /` carries `getAuth` but no identity guard; every admin route has all three guards in the correct order; a sweep confirms no route is left ungoverned.
- **`describe('…caching…')`** — Asserts `setCache(3600, { tags: ['locales'], browserRevalidate: true })` on public reads; absence of any `setCache` on entry/translation reads; `invalidateCache([locales])` on write routes; and *absence* of that call on translation routes (their tag is service-owned).
- **Mock** — `@infrastructure/http/middlewares/cache` is replaced with `cacheMock()` from `@tests/routes` before the router import, so cache assertions read the declared options without hitting a real cache layer.

## Relationships

- **`src/modules/locales/routes.ts`** — Module under test. The test imports its `router` export and asserts against its route table, guard chains, and middleware options.
- **`tests/support/routes.ts`** — Provides every inspection helper used here: `routeTable`, `routeSignatures`, `guardsOn`, `optionsOf`, `identityGuardIndex`, `chainOf`, and `cacheMock()`. The test has no other dependency on this file.

## Notes

- There is **no router-level auth middleware**; authorization is expressed per-route. The "ungoverned route" sweep test is the safety net for this choice—a newly added route that forgets its guards will be caught here, not at runtime.
- `GET /` is the one public route that calls `getAuth` (to enrich the manifest with inactive languages for an authenticated admin) while still remaining reachable anonymously. It is explicitly tested to have `getAuth` but *not* an identity guard.
- The ordering assertion (`/apps` < `/:locale`) is a regression guard: reversing them would cause `GET /locales/apps` to be captured by the `/:locale` parameter and 404.
- Translation routes (`/translations/:entityType/:id`) are excluded from the `invalidateCache(['locales'])` assertion because their cache tag is dynamic (varies with `entityType`) and is cleared inside the service layer, not via route middleware.
