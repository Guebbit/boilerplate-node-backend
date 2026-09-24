---
source: src/modules/observability/metrics-scraper.ts
sha256: 274e695d10a046f04f3ab99316a4722fac26edd01cf4948d9550fca208097f67
generated_at: 2026-09-23T18:56:12.740200+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/metrics-scraper.ts

## Purpose

Express middleware that guards the single Prometheus scrape route (`GET /observability/metrics`) with a static bearer credential. It exists as a separate file from the route because Prometheus cannot hold a session token, so the standard `platform.observability.any.read` check used by other observability routes is not applicable here.

## Key elements

- **`isMetricsScraper(request, response, next)`** — the sole export. Validates the `Authorization: Bearer <token>` header against `process.env.NODE_METRICS_TOKEN` using `constantTimeEqual`. Three outcomes:
  - Token env var unset → `503` (deny-by-default), warning logged.
  - Header missing/malformed or token mismatch → `401`.
  - Match → `next()` is called.

## Relationships

- **`src/infrastructure/security/constant-time.ts`** — provides `constantTimeEqual`, used instead of `===` to avoid timing-attack prefix leakage on the token.
- **`src/infrastructure/http/response.ts`** — provides `rejectResponse`, the shared helper for the 503 and 401 rejections.
- **`src/infrastructure/adapters/logger.ts`** — provides `logger`, used for the one warning when the token is unset.
- **`src/modules/observability/routes.ts`** — mounts `isMetricsScraper` as the guard on the `/observability/metrics` route; this file is the guard it delegates to.
- **`src/modules/observability/tests/unit/metrics-scraper.test.ts`** — unit tests for the middleware's three code paths.

## Notes

- The `"Bearer "` prefix is **required**, not optional. A bare token in the header is treated as absent (empty string fed to the comparison), so the request fails with 401. This prevents a malformed header shape from ever reaching the equality check.
- Deliberately **not** re-exported from the module barrel (`index.ts`). The file docblock calls it "wiring, not published language."
- `Stryker disable/restore` comments bracket the 503 branch to suppress mutation-testing noise on that path.
- The env var is `NODE_METRICS_TOKEN` (not a generic `METRICS_TOKEN`), tying it to the Node runtime's process env.
