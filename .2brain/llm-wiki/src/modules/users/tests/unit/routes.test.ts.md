---
source: src/modules/users/tests/unit/routes.test.ts
sha256: 69ee66a367e08ea3b7fa833d2765e6c255c0f31c862b33ebdaf5ce04db03ac16
generated_at: 2026-09-23T19:36:46.058105+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/routes.test.ts

## Purpose

Structural contract test for the user-administration router. It asserts that every endpoint is mounted in the documented order, that the full authorization guard chain is present on each route in the correct sequence, that caching tags/keys are shared correctly across the two listing endpoints, that mutations invalidate both serving modules' caches, and that upload and hard-delete middleware are attached exactly where they belong. It exists so a regressed mount order, a dropped guard, or a missing cache invalidation fails loudly in CI rather than silently exposing an admin-only directory.

## Key elements

- **`ALL`** – Ordered list of the 10 documented endpoint signatures (`POST /search` … `DELETE /:id/2fa`). Used as the single source of truth for both the mount-order test and the per-endpoint `it.each` loops.
- **`describe('user routes — what is mounted')`** – Verifies the exact signature list and that `/search` precedes `/:id` (path specificity).
- **`describe('user routes — authorization')`** – Per endpoint, asserts the guard chain contains `getAuth`, an identity guard (`isAuthOrCredential`), and `requirePermissionGuard` in that strict order. Also asserts zero endpoints lack `requirePermissionGuard`.
- **`describe('user routes — caching and uploads')`** – Checks shared cache key (`users:search`, tag `users`) on both listings; single-read cache tag on `GET /:id`; dual-tag invalidation (`users|account`) on all mutation routes; `upload.single(imageUpload)` + `validateUploadedImages` + `quarantineUploadedImages` on create/update; and `routeFlag(hardDelete)` exclusive to `DELETE /:id/hard`.
- **Jest mocks** – Replaces `cache`, `route-flag`, and `upload` middlewares with lightweight spies (sourced from `tests/support/routes.ts` mock factories) so `chainOf` can read the decorator chain as strings.

## Relationships

- **`src/modules/users/routes.ts`** – The sole SUT. This file imports `{ router }` from it and inspects the router's mounted paths, guard arrays, and middleware chains.
- **`tests/support/routes.ts`** – Provides all inspection utilities (`routeTable`, `routeSignatures`, `guardsOn`, `optionsOf`, `identityGuardIndex`, `chainOf`) and the three mock factories (`cacheMock`, `routeFlagMock`, `storageMock`) used in the `jest.mock` hoists.

## Notes

- Guards are asserted **per endpoint** via `it.each(ALL)`, not once globally. This means a route accidentally mounted *above* the `router.use(getAuth, isAuthOrCredential)` line still produces a failing assertion for that route specifically.
- The identity guard is `isAuthOrCredential` (not plain `isAuth`) because the user directory doubles as a tenant sync surface reachable by API keys.
- Cache invalidation must clear **both** `users` and `account` tags: the same row is served to admins at `/users/:id` and to the owner at `/account`. Clearing only one leaves the other serving stale data.
- `keyParameters` on the shared listing cache key is asserted non-empty — a key with no parameters would collapse all tenant listings into one shared entry.
