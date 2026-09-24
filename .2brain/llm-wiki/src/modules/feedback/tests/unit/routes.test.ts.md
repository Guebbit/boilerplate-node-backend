---
source: src/modules/feedback/tests/unit/routes.test.ts
sha256: 91052f058864abcdd338662679e65ab74625b4a45f175a6b7246abed4272be90
generated_at: 2026-09-23T18:42:58.722029+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/unit/routes.test.ts

## Purpose

Unit tests that pin the feedback route table's shape: which endpoints exist, their order, where the auth/permission gate sits, how caching keys and invalidation are wired, and where the rate-limit and human-challenge guards are placed on `POST /contact`. Assertions are deliberately **positional** (order in the chain matters) because the routes below the gate are distinguished only by position, not by route-level middleware identity.

## Key elements

- **`describe('feedback routes — what is mounted')`** – Asserts the exact signature list (`POST /contact`, `POST /search`, `GET /`, `PUT /:id`, `DELETE /:id`) and order.
- **`describe('feedback routes — the positional guard')`** – Verifies `POST /contact` has _no_ identity guard or `requirePermissionGuard`, while every other route carries `getAuth` + `requirePermissionGuard`. Includes a sweep that any future route below the gate is automatically covered.
- **`describe('feedback routes — caching')`** – Confirms `GET /` and `POST /search` share one cache key (`feedback:search`, TTL 600) and that all three write routes (`POST /contact`, `PUT /:id`, `DELETE /:id`) call `invalidateCache([feedback])`.
- **`describe('feedback routes — submission rate limiting')`** – Asserts three limiters (`submissions`, `submission-identity`, `submission-block`) fire _before_ cache invalidation on `POST /contact`, and that no other route carries them.
- **`describe('feedback routes — human-challenge gate (rung 3)')`** – Asserts `humanChallengeGate` appears on `POST /contact` _after_ the submission limiters, and on no other route.
- **Mocks** – `@infrastructure/http/middlewares/cache` and `@infrastructure/http/middlewares/rate-limit` are replaced via `jest.mock` with factories sourced from `tests/support/routes.ts` (`cacheMock`, `securityMock`).

## Relationships

- **`src/modules/feedback/routes.ts`** — the unit under test; this file imports its exported `router` and inspects it via the support helpers.
- **`tests/support/routes.ts`** — provides every inspection helper used here (`routeSignatures`, `guardsOn`, `optionsOf`, `identityGuardIndex`, `chainOf`) plus the `cacheMock` / `securityMock` factories referenced in the `jest.mock` calls.

## Notes

- The module-level doc comment explains _why_ assertions are positional: if `router.use(getAuth, …)` were accidentally mounted above `POST /contact`, per-route guard checks would still pass because the guard simply wouldn't be in that route's chain. The pairing of "contact has no guard" + "contact is first" is what pins the gate's position.
- Cache TTL is asserted as **600 s** (not the 3600 s used by the catalogue module) because the operator queue is read while it is actively changing.
- The `jest.mock` factories use a non-standard pattern — `jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()` — to pull typed mock implementations from the test-support module rather than inlining them.
- Rate-limiting on `POST /contact` is a _separate_ set of limiters from the credential-form limiters; the test asserts all three dimensions (address, identity, address-block) are present and ordered before any cache-invalidation call.
