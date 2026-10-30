---
source: src/modules/products/tests/unit/routes.test.ts
sha256: d8828996f859fd3ebe8141edc6f08eb15f2aa275d44046bcc72bee78f0be8f59
generated_at: 2026-10-29T05:35:00.883240+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/routes.test.ts

## Purpose

Structural contract test for the product catalogue route table. It verifies that routes are mounted in the correct order, carry the expected middleware chains (auth, caching, upload, flags), and that no route is accidentally added, reordered, or silently un-guarDED — regressions that TypeScript and runtime both miss.

## Key elements

- **`TAG`** (`'products'`) — single declaration of the catalogue cache tag; reused across assertions.
- **Three `jest.mock` calls** — replace the `cache`, `route-flag`, and `upload` middleware modules with mock factories sourced from `tests/support/routes.ts`, so the test inspects chains symbolically rather than executing real I/O.
- **`describe("what is mounted")`** — asserts the full ordered list of route signatures, static-path-before-`/:id` ordering, and router-level `getAuth`.
- **`describe("the product page and its stock count")`** — confirms `GET /:id` sets `browserRevalidate: true` so clients revalidate after stock writes.
- **`describe("authorization")`** — parameterised checks that all mutating routes stack `identity` → `requirePermissionGuard` (in that order), that `POST /`, `PUT /:id`, `PATCH /:id` carry **two** permission guards (products + translations), and that all read routes are public.
- **`describe("caching")`** — verifies shared `keyAs` between `GET /` and `POST /search`, `previewDraftLanguage` mounted before `setCache`, correct `tags`, 3600 s TTL, and `invalidateCache([products])` on every write route.
- **`describe("uploads and flags")`** — confirms `upload.image` + `validateUploadedImages` + `quarantineUploadedImages` on write routes, and that `routeFlag(hardDelete)` appears only on `DELETE /:id/hard`.

## Relationships

- **`src/modules/products/routes.ts`** — the system under test; the file imports its `router` export and inspects every aspect of its middleware chain.
- **`tests/support/routes.ts`** — the test harness. Provides the introspection helpers (`routeTable`, `routerMiddleware`, `routeSignatures`, `optionsOf`, `identityGuardIndex`, `chainOf`) and the mock factories (`cacheMock`, `routeFlagMock`, `storageMock`) referenced inside the `jest.mock` calls.

## Notes

- Invalidation assertions use the **literal** string `products` inside the expected `invalidateCache` text rather than the `TAG` constant. This is deliberate: if the tag is renamed, the constant and the literal will diverge and the test fails, catching the mismatch in one place.
- Middleware mocks are wired via `jest.requireActual` of the support module rather than inline factory objects, keeping mock definitions in a single shared location.
- Express matches routes in mount order; the test explicitly encodes that `/search` and `/facets` must appear before `/:id` to avoid being shadowed.
- Heavy use of `it.each` over route-signature arrays keeps each assertion one-liner and makes a missing route fail with the signature in the message.
