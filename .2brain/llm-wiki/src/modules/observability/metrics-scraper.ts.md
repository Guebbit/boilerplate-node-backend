---
source: src/modules/observability/metrics-scraper.ts
source_sha256: 888e4c7aff96bba82956256c6f0e0ec46b8265371a3717210f31b2b68d78481f
context_sha256: 8f00945eb1837977c0c7f6a594d4ede62f18ce2e55797ab0d6c756c94a7530a3
generated_at: 2026-11-22T06:01:49.869885+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/metrics-scraper.ts

## Purpose
Express middleware that guards the Prometheus scrape endpoint (`GET /observability/metrics`) with a static bearer credential. Prometheus cannot hold a session, so it cannot use the bearer token that the module's other routes check `read:ObservabilitySnapshot` against. The file lives beside the route it guards and is deliberately kept off the module's barrel, because it is wiring rather than published language. It is not rate limiting.

## Key elements
- `isMetricsScraper(request, response, next)`: the only export. It reads `NODE_METRICS_TOKEN` from `observabilityConfig()` and behaves as follows:
  - **Token unset:** denies by default. It logs a warning and responds `503` through `rejectResponse`.
  - **Header parsing:** requires the `Authorization: Bearer <token>` scheme. A header without the `Bearer ` prefix is treated as an empty token.
  - **Comparison:** uses `constantTimeEqual(expected, provided)`.
  - **Mismatch:** responds `401`. If a non-empty token was provided, it also records a security event (see Relationships).
  - **Match:** calls `next()`.

## Relationships
- `src/modules/observability/config.ts`: `observabilityConfig()` supplies `NODE_METRICS_TOKEN`.
- `src/modules/observability/audit.ts`: its audit-actions export supplies the action recorded on a wrong token.
- `src/infrastructure/security/constant-time.ts`: `constantTimeEqual` performs the token comparison.
- `src/infrastructure/http/response.ts`: `rejectResponse` sends the 503 and 401 responses, each with an empty list.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context for the security event.
- `src/infrastructure/observability/security-events.ts`: `recordSecurityEvent` records invalid-token attempts, with the route path as the payload.
- `src/infrastructure/adapters/logger.ts`: provides the logger used for the missing-token warning.
- `src/modules/observability/routes.ts` and `src/modules/observability/worker-routes.ts`: neighbors in the dependency graph. The file's own text only says it guards the module's one route, `GET /observability/metrics`, so which of them applies it is not visible here.
- `src/modules/observability/tests/unit/metrics-scraper.test.ts`: the unit tests for this middleware.

## Notes
- The token is compared with `constantTimeEqual` instead of `===`. The code comments say `===` would leak the token's prefix through timing.
- Only a wrong token produces a security event. A missing token is treated as a probe and is not recorded, though it is still rejected with `401`.
- The 401 response is the same whether the token was missing or wrong.
- The missing-token warning is wrapped in `// Stryker disable all` / `restore all` comments, which exclude it from mutation testing.
