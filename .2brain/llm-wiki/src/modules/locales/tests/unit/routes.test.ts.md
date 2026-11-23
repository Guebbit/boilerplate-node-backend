---
source: src/modules/locales/tests/unit/routes.test.ts
source_sha256: d1706432cc0e5af72469b496ae1a1c3c4652302f3d89d065038814728b3d66da
context_sha256: 9dfda2d14525ad579241f153c95acb2e0072499941126bc06caf640b65451a69
generated_at: 2026-11-22T05:51:34.658467+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/tests/unit/routes.test.ts

## Purpose
Unit tests that pin down the locales router's route table: which endpoints are mounted and in what order, who may call them, and how each is cached or invalidated. The file's header says it asserts two deliberate choices so that "fixing" either one fails loudly. Reads are public, because a client that couldn't reach the API is the one that needs a dictionary. Every admin route declares its own guards, with no router-level gate, because public reads must be declared first.

## Key elements
- **Route lists**
  - `PUBLIC` holds the 5 public reads.
  - `MANIFEST_READS` and `LANGUAGE_READS` are subsets of `PUBLIC`.
  - `ADMIN` holds 17 routes: the locale writes, the entry CRUD under `/:locale/apps/:app/entries`, and the `/translations/:entityType/:id` routes.
  - `ENTRY_READS` and `TRANSLATIONS` are sets of admin routes that are left uncached.
- **"what is mounted"**
  - The router's signatures must equal `[...PUBLIC, ...ADMIN]` exactly, in order.
  - `/apps` must be declared before `/:locale`, otherwise Express would treat "apps" as a language.
- **"authorization"**
  - Public routes have no identity guard and no `requirePermissionGuard`.
  - `GET /` and `GET /:locale` take `getAuth` without requiring identity.
  - Each admin route has `getAuth`, then an identity guard, then `requirePermissionGuard`, in that order.
  - A sweep fails if any route is neither public nor permission-guarded.
- **"caching"**
  - Public routes use `setCache(3600…` with `languageNeutral: true` and `browserRevalidate: true`.
  - The manifest reads are tagged `locales:manifest`.
  - Language reads are tagged `locale:pt-BR`, so the tag is canonical whatever the path spelling.
  - Entry reads and translation routes have no `setCache`.
  - The remaining admin writes carry `invalidateCache([locale:pt-BR|locales:manifest])`.
  - `POST /` takes its tag from the body, so it invalidates `locale:sv-SE|locales:manifest`.
  - The translation routes have no `invalidateCache` at all, because their tag is registry-declared and cleared inside the service.

## Relationships
- Imports `router` from `src/modules/locales/routes.ts`, the unit under test. It inspects the router's table and never sends HTTP requests.
- Imports its inspection helpers from `tests/support/routes.ts` (alias `@tests/routes`): `routeTable`, `routeSignatures`, `guardsOn`, `optionsOf`, `identityGuardIndex` and `chainOf`.
- Also uses `cacheMock()` from that file as the mock for `@infrastructure/http/middlewares/cache`. The mock is what makes `setCache(...)` and `invalidateCache([...])` appear as readable chain entries, with options extracted by `optionsOf`.

## Notes
- The `jest.mock` call appears before the `router` import so the router is built with the mocked cache middleware.
- The sample request in the helpers evidently uses `pt-br` in the path and `sv-se` in the body. The tests rely on this to check that tags are canonicalized (`pt-BR`, `sv-SE`).
- Adding a route to the router means updating the lists here. The order test and the ungoverned-route sweep will fail otherwise.
