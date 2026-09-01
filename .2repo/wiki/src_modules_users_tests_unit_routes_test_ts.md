# src/modules/users/tests/unit/routes.test.ts

## Purpose

Unit tests for the user-administration router that verify three invariants without spinning up a server: (1) the exact set and order of mounted endpoints, (2) that every endpoint carries the `getAuth → isAuth → isAdmin` guard chain in that order with no public endpoints leaking through, and (3) correct cache tagging, upload validation, and feature-flag gating. The file exists so that a route accidentally mounted above the shared `isAdmin` middleware, a removed cache tag, or a broken ordering is caught at test time rather than in production.

## Key elements

- **`ALL`** — Ordered array of the nine `METHOD /path` signatures the router must expose, from `POST /search` through `DELETE /:id/hard`.
- **`chainOf(signature)`** — Looks up one endpoint in `routeTable(router)` and returns its middleware chain (array of string descriptions) for inspection.
- **"what is mounted" block** — Asserts the router exposes exactly `ALL` in order and that `/search` is mounted before `/:id` (Express would otherwise shadow it).
- **"authorization" block** — Per-endpoint assertion that `getAuth`, `isAuth`, `isAdmin` all appear *and* in that relative order; plus a global assertion that zero endpoints lack `isAdmin`.
- **"caching and uploads" block** — Verifies shared cache key (`users:search`, tag `users`, 3600 s TTL) for `GET /` and `POST /search`; `GET /:id` under the `users` tag; all mutating routes invalidate both `users` and `account` tags; `POST/PUT /` and `PUT /:id` include `upload.single(imageUpload)` + `validateUploadedImages` + `quarantineUploadedImages`; `DELETE /:id/hard` is gated behind `routeFlag(hardDelete)` while the soft-delete routes are not.
- **`jest.mock` calls** — Stub `cache`, `route-flag`, and `storage` infrastructure so the router can be inspected as a pure middleware chain without I/O.

## Relationships

- **`src/modules/users/routes.ts`** — The module under test; its exported `router` is imported and passed to every helper. The test file asserts the observable shape of that router without invoking any handler.
- **`tests/support/routes.ts`** — Supplies the inspection helpers (`routeTable`, `routeSignatures`, `guardsOn`, `optionsOf`) and the mock factories (`cacheMock`, `routeFlagMock`, `storageMock`) referenced in the `jest.mock` calls. The test file depends on its API contract for both setup and assertions.

## Notes

- Guard **order** is asserted, not just presence: `isAdmin` reads the role off the request context that `getAuth` populates; if the order flips, `isAdmin` would read `undefined`.
- The "no public endpoint" test is a deliberate tripwire: it fails if someone mounts a "harmless" `GET` above the `router.use(...isAdmin)` line, since that route would never see the guard.
- Both `users` **and** `account` cache tags are required on invalidation because the same user row is served by two different modules (`/users/:id` and `/account`); clearing only one leaves a stale profile for the other audience.
- The file relies on string-matching against the middleware chain (`chainOf` returns descriptive strings like `'setCache(3600…)'`). If a helper in `@tests/routes` changes its formatting, these assertions break even though the router is unchanged.
