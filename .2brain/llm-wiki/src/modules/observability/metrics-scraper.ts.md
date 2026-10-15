---
source: src/modules/observability/metrics-scraper.ts
sha256: f4030a1bb38290544b4037888cbd528f14b34e378e8f259b18a5f97a796fb6f4
generated_at: 2026-10-15T10:55:12.013603+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/metrics-scraper.ts

## Purpose

Single-purpose Express middleware that guards `GET /observability/metrics` with a static bearer token. Prometheus scrapers cannot hold sessions or present the `platform.observability.any.read` permission used by the other observability routes, so this endpoint gets its own credential. The file lives beside the route it protects and is deliberately kept out of the module barrel — it is wiring, not published language.

## Key elements

- **`isMetricsScraper(request, response, next)`** — the sole export. Express middleware that:
  - Returns **503** if `NODE_METRICS_TOKEN` is unset (deny-by-default).
  - Parses the `Authorization` header, requiring the literal `Bearer ` prefix (a bare token is rejected).
  - Compares the provided token against the configured value with `constantTimeEqual`.
  - Returns **401** on mismatch; records a security event only when a token *was* provided (wrong token = credential guess; missing token = probe).
  - Calls `next()` on success.

## Relationships

- **`src/modules/observability/config.ts`** — calls `observabilityConfig()` to read `NODE_METRICS_TOKEN`.
- **`src/modules/observability/routes.ts`** — the route this middleware is mounted on.
- **`src/infrastructure/security/constant-time.ts`** — provides `constantTimeEqual` for the token comparison.
- **`src/infrastructure/http/response.ts`** — provides `rejectResponse` for the 503/401 exits.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf` to populate the audit record's caller field.
- **`src/infrastructure/observability/audit.ts`** — supplies the `coreAuditActions.SECURITY_METRICS_TOKEN_INVALID` action constant.
- **`src/infrastructure/observability/security-events.ts`** — `recordSecurityEvent` is called on each invalid-token attempt.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` when the token is unset.
- **`src/modules/observability/tests/unit/metrics-scraper.test.ts`** — unit tests covering all three branches (unset, missing/invalid, valid).
- **`tests/integration/observability-auth.test.ts`** — integration tests exercising the endpoint's auth flow end-to-end.

## Notes

- **Timing side-channel:** `constantTimeEqual` is used instead of `===` specifically so an attacker cannot recover the token's prefix by measuring response time.
- **`Bearer ` prefix is mandatory, not optional.** The code does not strip-if-present; it requires the scheme. A token sent without `Bearer ` is treated as absent.
- **Stryker annotations** (`// Stryker disable all` / `// Stryker restore all`) surround the 503 branch to suppress mutation testing there — that branch is a config-error path, not logic worth mutating.
- The file is intentionally **not re-exported** from the observability barrel; import it directly if you need to reference it.
