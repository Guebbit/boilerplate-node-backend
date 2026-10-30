---
source: src/modules/locales/tests/unit/routes.test.ts
sha256: 82deb9c4caaefc1bdf3ff8690fade67cf9f333351f0fb0056152c93ec1612da5
generated_at: 2026-10-29T04:26:56.233492+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/routes.test.ts

## Purpose

Unit test that locks the locales route table's three structural invariants: exact endpoint set and ordering, per-route authorization (no router-level gate), and the public/entry/translation caching split. It exists so that "fixing" a deliberate design choice—making a read private, adding a shared gate, or reordering `/apps` past `/:locale`—fails loudly instead of silently.

## Key elements

- **`PUBLIC`** – 5 read-only endpoints (`GET /`, `GET /apps`, `GET /:locale/messages`, `GET /:locale/dictionary`, `GET /:locale`) that must answer without a token.
- **`ADMIN`** – 17 write and admin-read endpoints that each declare their own `getAuth` → identity guard → `requirePermissionGuard` chain.
- **`ENTRY_READS`** (Set) – the three `GET /:locale/…/entries` routes that feed the editing screen; asserted to be uncached.
- **`TRANSLATIONS`** (Set) – `GET/PUT/PATCH /translations/:entityType/:id`; uncached and their invalidation is registry-declared inside the service, not via route middleware.
- **`describe('…what is mounted')`** – asserts the full signature list in order and that `/apps` precedes `/:locale` (Express first-match).
- **`describe('…authorization')`** – per-route guard assertions: public reads have no identity/permission guard; `GET /` and `GET /:locale` carry `getAuth` without an identity guard; every ADMIN route carries all three guards in order; a sweep test ensures no route is neither public nor fully guarded.
- **`describe('…caching')`** – public reads use `setCache(3600…)` with `tags: ['locales']` and `browserRevalidate: true`; entry/translation reads are uncached; all other ADMIN writes call `invalidateCache([locales])`; TRANSLATIONS routes do **not** invalidate the `locales` tag.
- **`jest.mock('@infrastructure/http/middlewares/cache')`** – replaced with `cacheMock()` from the test-support module so route chains can be introspected without a live cache.

## Relationships

- **`src/modules/locales/routes.ts`** – the system under test; this file imports its `router` and asserts against its mounted handlers, middleware chains, and options.
- **`tests/support/routes.ts`** – provides the introspection helpers (`routeTable`, `routeSignatures`, `guardsOn`, `optionsOf`, `identityGuardIndex`, `chainOf`) and the `cacheMock()` factory used by the mock above.

## Notes

- Express resolves the first matching route, so `/apps` must be registered before `/:locale`; the test asserts index ordering, not just presence.
- `GET /` is the only public read that still passes `getAuth` (an admin's manifest lists inactive languages). Dropping it narrows the admin view; adding an identity guard breaks anonymous access. The test pins both facts.
- TRANSLATIONS invalidation is intentionally **not** `invalidateCache([locales])` at the route level—the tag is `entityType`-dependent and is cleared inside the service. A future refactor that "centralises" invalidation will break this assertion, which is the intended guard.
- The "no ungoverned route" sweep is the safety net that compensates for the absence of a router-level gate: any new mount defaults to unguarded, so the test catches it.
