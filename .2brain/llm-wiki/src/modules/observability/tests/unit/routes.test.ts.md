---
source: src/modules/observability/tests/unit/routes.test.ts
sha256: 70d4228bf5c5b33806e90ad590480a139a97af07a4f198e1d6d396011a65878c
generated_at: 2026-11-08T06:44:21.105167+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/routes.test.ts

## Purpose

Unit tests that verify the **route table** of the observability module: which endpoints are mounted, in what order, and which guard chain protects each one. It does not test handler logic — it asserts the structural contract of `router` as exported by `routes.ts`.

## Key elements

- **`describe('observability routes — what is mounted')`**
  - Asserts the exact set and order of route signatures: `GET /events`, `GET /metrics`, `GET /health`, `GET /metrics/overview`, `GET /audit`.
  - Asserts `/metrics` appears before `/metrics/overview` in the table (ordering convention; guards against a future `/metrics/:name` colliding).

- **`describe('observability routes — the two guard styles')`**
  - `GET /events` — guarded by `requireAllowedOrigin` → `requirePermissionViaCookieGuard` → `getObservabilityEvents`. Explicitly asserts `isAuth` is **not** in the chain (EventSource cannot send headers).
  - `GET /metrics` — guarded by `isMetricsScraper` → `getObservabilityMetrics` (Prometheus scrape; no login).
  - `GET /health`, `GET /metrics/overview`, `GET /audit` — each must contain `getAuth`, `isAuth`, and `requirePermissionGuard` (ordinary admin chain).
  - **No-endpoint-unguarded sweep** — filters all routes and asserts none lack one of the three recognised permission guards.

## Relationships

- **`src/modules/observability/routes.ts`** — the system under test; this file imports its `router` export and asserts on its shape.
- **`tests/support/routes.ts`** — provides the introspection helpers `routeSignatures`, `guardsOn`, and `routeTable` used throughout the tests.

## Notes

- This file tests **structure only** (mount order, guard chains). Handler behaviour is covered by `get-observability-events.test.ts` and `get-observability-metrics.test.ts` (referenced in the file header comment).
- The "no endpoint unguarded" test intentionally covers all three guard styles in a single sweep, so a new route added with any valid guard passes while one with none fails — making it a broad regression net.
- The `/metrics` vs `/metrics/overview` ordering assertion is a defensive check; the two paths cannot collide today, but the comment in the source notes this pair is the one spot where a future dynamic route would break.
