---
source: src/modules/feedback/tests/unit/routes.test.ts
sha256: d5de79c8770763361202df90d46cdad50f75e0e74e6482fc352ca0642dfd5487
generated_at: 2026-09-27T14:54:50.177868+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/unit/routes.test.ts

## Purpose

Pins the structural contract of the feedback router: exactly which routes exist, their order, and the middleware/guard chain attached to each. The tests are deliberately **positional** because the auth gate (`router.use(getAuth, …)`) is mounted by position, not by name—so asserting "this route has a guard" alone would pass even if the gate were mis-ordered. This file exists so a refactor that silently moves the gate, drops a limiter, or reorders routes fails immediately.

## Key elements

- **`routeSignatures(router)`** – returns the ordered list of `"METHOD /path"` strings; used to verify the exact endpoint set and that `POST /contact` is first.
- **`guardsOn(router, signature)`** – returns the ordered guard names on a specific route; used to confirm public-vs-keyed split and `requirePermissionGuard` presence.
- **`identityGuardIndex(guards)`** – index of the auth/identity guard within a chain; `-1` means the route is above the gate.
- **`chainOf(router, signature)`** – full ordered middleware chain (limiters, caching, challenge gate, handler); used for rate-limit, caching, and `humanChallengeGate` assertions.
- **`cacheMock` / `securityMock`** (from `tests/support/routes.ts`) – factory helpers wired through `jest.mock` so the real cache and rate-limit modules are replaced with stable named stubs.
- **Test suites**: route order, positional guard split, cache headers (`privateNoCache` / `noStore`), submission rate-limiting (three limiter dimensions + ordering before the handler), and the `humanChallengeGate` rung.

## Relationships

- **`src/modules/feedback/routes.ts`** — the module under test. This file imports its exported `router` and asserts on its structure; every assertion is a guard against an unintended change in that file.
- **`tests/support/routes.ts`** — provides all four inspection helpers (`routeSignatures`, `guardsOn`, `identityGuardIndex`, `chainOf`) and the two mock factories (`cacheMock`, `securityMock`). The test file never reimplements chain-walking logic; it delegates entirely to this support module.

## Notes

- The mock factories are pulled via `jest.requireActual('@tests/routes')` inside the `jest.mock` factory to avoid circular-initialisation issues—`@tests/routes` is the *real* module, not a mock.
- Rate-limit assertions check three distinct limiter prefixes (`submissions`, `submission-identity`, `submission-block`) and verify they appear **before** the `postFeedbackContact` handler, ensuring a spent budget never reaches the DB.
- The "sweep" style (iterate all non-contact routes and assert a property) means a newly added route below the gate is covered automatically; a route accidentally added above the gate will fail the identity-guard assertion.
- Caching assertions reference RFC 9111 §3.5 semantics: `GET /` gets `privateNoCache` (browser may revalidate), while `POST /search` gets `noStore`. No route should carry a shared `setCache*` entry.
