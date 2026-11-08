---
source: src/modules/wishlist/tests/unit/routes.test.ts
sha256: d8edec929b39c83c4958a02a6e5c81270e6a0c7a8293859f07e3ec1d201f72f8
generated_at: 2026-11-08T09:15:39.896526+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/unit/routes.test.ts

## Purpose

Unit tests that lock down the wishlist router's public contract: the exact set of endpoints, their order, the presence of session authentication on every route, and the absence of any admin/permission guard. They exist to catch unintended route additions or guard changes before they reach review.

## Key elements

- **`describe('wishlist routes')`** — top-level suite; no setup/teardown hooks.
- **`it('mounts exactly the documented endpoints…')`** — asserts `routeSignatures(router)` equals the four known signatures in order (`GET /`, `POST /items`, `POST /items/:productId/move-to-cart`, `DELETE /items/:productId`).
- **`it.each([...])('%s requires a session')`** — parameterized check that every route carries the `isAuth` guard.
- **`it('is admin-free by design…')`** — filters all routes for `requirePermissionGuard` and expects the result to be empty; a deliberate canary so that any future admin surface fails the suite and forces a design discussion.

## Relationships

- **`src/modules/wishlist/routes.ts`** — the system under test. This file imports its `router` export and introspects it exclusively through the two helpers below.
- **`tests/support/routes.ts`** — provides the introspection helpers `routeSignatures` (extracts method + path pairs from a router) and `guardsOn` (lists guard names attached to a given signature). No other test-specific logic lives in this file.

## Notes

- Route **order** is part of the contract (Express-style matchers are positional); reordering routes in `routes.ts` will break the first assertion even if the set of endpoints is unchanged.
- The "admin-free" test is intentionally self-documenting: its comment states the *why* (no operator view of another user's wishlist) so that removing or weakening the assertion is a visible, reviewable decision.
- No HTTP calls are made — the tests are pure structural assertions on the router definition.
