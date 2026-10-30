---
source: src/modules/tickets/tests/unit/routes.test.ts
sha256: b6e4279960c027ddfb7002fcd51acb0cbb02e8f271b2609a0d0f22e02f0d629c
generated_at: 2026-10-29T06:09:18.527405+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/tests/unit/routes.test.ts

## Purpose

Unit test for the tickets router's route table. It verifies that `POST /` (the visitor contact form) is mounted **above** the auth gate and is the only public route, that every other route sits **below** the gate with `requirePermissionGuard`, and that caching, rate-limiting, and human-challenge middleware are attached to the correct routes in the correct order. Assertions are positional (not per-middleware) because `router.use` makes routes keyed only by their position in the table.

## Key elements

- **`describe('tickets routes — what is mounted')`** — asserts the exact ordered list of 12 route signatures (method + path) on the router.
- **`describe('tickets routes — the positional guard')`** — verifies `POST /` has no identity guard and no `requirePermissionGuard`; all 11 other routes do; `getAuth` appears on `POST /` but before `postTicket` (resolves session, does not reject); the contact route is index 0 so the gate cannot be moved above it; every non-`POST /` route carries `requirePermissionGuard`.
- **`describe('tickets routes — caching')`** — `GET /` chain contains `privateNoCache` (browser-only revalidation, RFC 9111 §3.5) and no `setCache*` entry; `POST /search` chain contains `noStore` and no `setCache*` entry.
- **`describe('tickets routes — submission rate limiting')`** — `POST /` chain contains exactly `['submissions', 'submission-identity', 'submission-block']` before `postTicket`; no other route carries any `submission*` limiter.
- **`describe('tickets routes — human-challenge gate (rung 3)')`** — `humanChallengeGate` appears on `POST /` after `submission-block`; it appears on no other route.
- **`jest.mock` for `cache` and `rate-limit` middlewares** — replaced with `cacheMock()` and `securityMock()` (both sourced from `@tests/routes`) so the real middleware is never exercised.

## Relationships

- **`src/modules/tickets/routes.ts`** — the file under test; this test imports its single export `router` and inspects its mounted routes and middleware chains.
- **`tests/support/routes.ts`** — provides all test helpers used here: `routeSignatures`, `guardsOn`, `identityGuardIndex`, `chainOf`, and the mock factories `cacheMock` / `securityMock`. The file header comment explicitly points to `effectiveRouteTable` in this support file as the reason assertions are positional.

## Notes

- **Positional, not per-route, assertions.** The file header explains that `router.use(getAuth, isAuthOrCredential)` and per-route `requirePermission` make routes "keyed purely by position." Checking only per-route middleware would pass even if the gate were accidentally moved. The pairing of the ordering assertion (`routeSignatures()[0] === 'POST /'`) with the guard-absence assertion is what pins the gate placement.
- **`getAuth` ≠ identity guard.** The test explicitly asserts `getAuth` is present on `POST /` but that `identityGuardIndex` is `-1`. `getAuth` resolves a session when one exists; it does not reject anonymous callers.
- **Rate-limiting is three-dimensional.** The contact form uses `submissions` (address), `submission-identity`, and `submission-block` (address-block). The comment notes these are a *different* set from `credentialLimiters`.
- **Sweep-style assertions.** Several tests iterate over all non-`POST /` routes rather than hardcoding a list, so a newly added route below the gate is covered automatically while one added above it fails the guard check.
