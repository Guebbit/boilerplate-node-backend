---
source: src/modules/locales/tests/unit/routes.test.ts
sha256: 82deb9c4caaefc1bdf3ff8690fade67cf9f333351f0fb0056152c93ec1612da5
generated_at: 2026-11-08T06:29:21.994719+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/routes.test.ts

## Purpose

Asserts the route table, per-route authorization guards, and caching configuration of the locales router. Each test encodes a deliberate design decision (public reads, per-route guard ordering, shared vs. service-level cache invalidation) so that silently "fixing" any of them causes an immediate test failure.

## Key elements

- **`PUBLIC`** – Array of the 5 read-only route signatures any visitor may use.
- **`ADMIN`** – Array of the 17 admin route signatures (writes + entry reads + translation routes).
- **`ENTRY_READS`** – Set of 3 route signatures that serve the editing screen; asserted to be uncached.
- **`TRANSLATIONS`** – Set of 3 route signatures whose cache tag is registry-declared and cleared inside the service, not via route middleware.
- **`describe('…what is mounted')`** – Verifies the exact signature list and that `/apps` precedes `/:locale` (Express first-match ordering).
- **`describe('…authorization')`** – Verifies public routes carry no identity/permission guard; admin routes carry `getAuth` → identity → `requirePermissionGuard` in that order; a final sweep confirms no route is unguarded.
- **`describe('…caching')`** – Verifies public reads share one `setCache(3600, { tags: ['locales'], browserRevalidate: true })`; entry/translation reads are uncached; admin writes call `invalidateCache([locales])`; translation routes do **not** invalidate the `locales` tag.

## Relationships

- **`src/modules/locales/routes.ts`** – Imports `router`; this file is its dedicated route-contract test.
- **`tests/support/routes.ts`** – Supplies the test helpers (`routeTable`, `routeSignatures`, `guardsOn`, `optionsOf`, `identityGuardIndex`, `chainOf`) and the `cacheMock()` factory used by the jest.mock at the top.

## Notes

- `jest.mock('@infrastructure/http/middlewares/cache', …)` must appear **before** the `router` import; the mock is hoisted by jest but the factory calls `cacheMock()` from the support module.
- `GET /` and `GET /:locale` are public yet include `getAuth` in their chain (to conditionally list inactive languages) while still having **no** identity guard — dropping `getAuth` narrows the admin view; adding a guard breaks the anonymous case.
- The "no unguarded route" sweep exists because there is no router-level gate; a future route added without its own three guards would silently default to open.
