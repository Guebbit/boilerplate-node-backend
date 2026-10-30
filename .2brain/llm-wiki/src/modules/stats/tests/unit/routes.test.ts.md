---
source: src/modules/stats/tests/unit/routes.test.ts
sha256: 8e9460f5b525454a86dbdd8043fedccc7bec3a514aadcdae74a17e7b31a6f2a0
generated_at: 2026-10-29T05:57:25.496004+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/tests/unit/routes.test.ts

## Purpose

Validates the stats router's contract: it exposes exactly nine documented `GET` endpoints, every one requires an authenticated session, and every one is gated by the single `read:Stats` permission. The file exists to make any unauthorised addition, method change, or permission drift fail immediately.

## Key elements

- **`jest.mock` for `rate-limit`** — replaces the rate-limit middleware with `securityMock()` (from the test-support module) so that guard extraction isn't obscured by a real rate-limiter.
- **`routeSignatures(router)`** — helper (imported from `@tests/routes`) that flattens the router into an array of `"METHOD /path"` strings; used to assert the exact endpoint list and to drive the per-route auth check.
- **`guardsOn(router, signature)`** — returns the list of guard names attached to a given route; asserted to always include `isAuth`.
- **`routeTable(router)`** — returns a structured table of routes with their permission rules; the test maps each to `action:subject` strings and asserts all nine are `'read:Stats'`.
- **`router`** (from `@modules/stats/routes`) — the system under test.

## Relationships

- **`src/modules/stats/routes.ts`** — the module under test; exports the `router` whose routes, guards, and permissions this file inspects.
- **`tests/support/routes.ts`** — provides the three helpers (`routeSignatures`, `routeTable`, `guardsOn`) and the `securityMock()` function used to neutralise the rate-limit middleware.

## Notes

- The mock of the rate-limit middleware is essential: without it, `guardsOn` would surface the rate-limiter and the `isAuth` assertion could be hidden or the guard list would include an unrelated entry.
- The "exactly nine" count and the all-GET constraint are intentional: the file's comment states that promoting any route to a write is a product decision that must be made explicitly, so the test blocks silent scope creep.
- `it.each(routeSignatures(router))` derives its test matrix from the live router, meaning the per-route auth check automatically covers whatever endpoints are currently mounted—no list to maintain.
