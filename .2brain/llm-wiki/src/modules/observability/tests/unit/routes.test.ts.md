---
source: src/modules/observability/tests/unit/routes.test.ts
sha256: a9e050e994ba732d65f91c09add75a83831ea1de7a9549e415e6223c4bd5d282
generated_at: 2026-09-27T15:06:22.560347+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/routes.test.ts

## Purpose

Structural contract test for the observability router. It verifies **what is mounted, in what order, and which guard chain protects each endpoint**, without exercising any handler logic. It exists so that a refactor of `routes.ts` that accidentally reorders routes, drops a guard, or adds an unguarded endpoint fails immediately.

## Key elements

- **`describe('observability routes — what is mounted')`** — Asserts the exact list of five route signatures and that `/metrics` precedes `/metrics/overview` in the table.
- **`describe('observability routes — the two guard styles')`** — Asserts the guard array for each endpoint:
  - `GET /events` → `requirePermissionViaCookieGuard` (SSE client cannot send headers).
  - `GET /metrics` → `isMetricsScraper` (Prometheus has no login flow).
  - `GET /health`, `GET /metrics/overview`, `GET /audit` → standard `getAuth` / `isAuth` / `requirePermissionGuard` chain (parameterised via `it.each`).
- **"Leaves no observability endpoint unguarded"** — Sweeps every mounted signature and asserts at least one of the three known guard names is present; catches any future route added with no protection.

## Relationships

- **`src/modules/observability/routes.ts`** — System under test. The test imports the exported `router` and inspects its table; no request is ever dispatched.
- **`tests/support/routes.ts`** — Provides the three introspection helpers (`routeSignatures`, `guardsOn`, `routeTable`) that flatten the router into plain arrays the assertions compare against.

## Notes

- Handler behaviour is explicitly **out of scope** here; the JSDoc header points to `get-observability-events.test.ts` and `get-observability-metrics.test.ts` for that.
- The `/metrics`-before-`/metrics/overview` ordering assertion is documented as a *convention* (the file's stated rule), not a hard functional requirement; the comment notes it would only matter if a future `/metrics/:name` parametric route were introduced.
- The "unguarded sweep" test is the safety net: it does not assert *which* guard is present, only that *some* known guard is. A new guard style added to the codebase must also be added to the whitelist inside that test or every route will appear "unguarded."
