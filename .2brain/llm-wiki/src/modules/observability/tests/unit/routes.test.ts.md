---
source: src/modules/observability/tests/unit/routes.test.ts
sha256: 70d4228bf5c5b33806e90ad590480a139a97af07a4f198e1d6d396011a65878c
generated_at: 2026-10-15T10:58:15.664008+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/routes.test.ts

## Purpose
Verifies the structural contract of the observability router: which endpoints exist, in what order, and which guard chain protects each one. It asserts the two non-standard guard styles (cookie for SSE, static credential for Prometheus) and confirms no endpoint is left unguarded.

## Key elements
- **`routeSignatures(router)`** — helper (from test support) that returns the ordered `METHOD /path` strings for all mounted routes.
- **`routeTable(router)`** — returns structured entries (including `path`) so ordering between `/metrics` and `/metrics/overview` can be checked.
- **`guardsOn(router, signature)`** — returns the ordered list of guard/controller names for a given route signature.
- **Endpoint-order test** — asserts the exact five-route list and that `/metrics` precedes `/metrics/overview`.
- **Guard-style tests** — three blocks:
  - `/events`: `requireAllowedOrigin → requirePermissionViaCookieGuard → getObservabilityEvents`; explicitly *not* `isAuth`.
  - `/metrics`: `isMetricsScraper → getObservabilityMetrics`.
  - `/health`, `/metrics/overview`, `/audit`: each contains `getAuth`, `isAuth`, `requirePermissionGuard`.
- **Unguarded-route sweep** — filters all signatures for any whose guard list contains none of the three recognised permission guards; asserts the result is empty.

## Relationships
- **`src/modules/observability/routes.ts`** — the module under test; exports `router`, the Hono (or equivalent) router instance that this file inspects.
- **`tests/support/routes.ts`** — provides the three introspection helpers (`routeSignatures`, `guardsOn`, `routeTable`) used throughout; this file is the sole consumer of those helpers in the observability test suite.

## Notes
- The `/events` guard test asserts the *absence* of `isAuth` as strongly as it asserts the presence of the cookie guard — a regression that re-adds header-based auth would break the only client (`EventSource`) this route serves.
- The ordering assertion on `/metrics` vs `/metrics/overview` is a forward guard: the comment notes that a future `/metrics/:name` parameterised route would shadow `/metrics/overview` if the order were reversed.
- The unguarded-route sweep intentionally enumerates all three accepted permission-guard names; adding a new guard style to the router requires updating this list or the sweep will flag valid routes as unguarded.
