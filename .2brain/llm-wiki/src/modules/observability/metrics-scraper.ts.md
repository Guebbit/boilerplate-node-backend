---
source: src/modules/observability/metrics-scraper.ts
sha256: 2b9aedf43d749185acb1b411f9a33ec9677bed11efbc0a9091c07b9dbe16ade6
generated_at: 2026-10-29T04:35:31.050318+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/metrics-scraper.ts

## Purpose

Express middleware that guards the single Prometheus scrape route (`GET /observability/metrics`) with a static bearer credential. It exists as a separate file (not a generic rate-limit middleware, not part of the module barrel) because Prometheus cannot hold a session and the other observability routes' `read:ObservabilitySnapshot` check does not apply to it.

## Key elements

- **`isMetricsScraper(request, response, next)`** — the sole export. Validates the `Authorization` header against `NODE_METRICS_TOKEN` using constant-time comparison. Denies with 503 when the token is unset, 401 when the header is missing or the token mismatches.

## Relationships

- **`config.ts`** — reads `observabilityConfig().NODE_METRICS_TOKEN` to obtain the expected credential.
- **`constant-time.ts`** — uses `constantTimeEqual` instead of `===` to avoid leaking the token's prefix via timing.
- **`response.ts`** — calls `rejectResponse` to emit 503 (token unset) or 401 (missing/invalid token) with an empty body.
- **`logger.ts`** — emits a one-time `warn` when `NODE_METRICS_TOKEN` is unset.
- **`request.ts`** — calls `callerContextOf(request)` to build the context passed into the security event.
- **`security-events.ts`** — records a `SECURITY_METRICS_TOKEN_INVALID` event only when a non-empty token was supplied and failed (distinguishes a guess from a bare probe).
- **`audit.ts`** — supplies the `observabilityAuditActions.SECURITY_METRICS_TOKEN_INVALID` action enum.
- **`tests/unit/metrics-scraper.test.ts`** — unit-tests the middleware's happy path, 503, 401, and security-event recording.

## Notes

- **Bearer prefix is mandatory, not optional.** A raw token without the `Bearer ` scheme is treated as absent (empty string), not stripped. This prevents a header shape no legitimate client should send.
- **Security event is recorded only for wrong tokens, not for missing ones.** The file explicitly documents this: a wrong token is a credential guess; no token is merely a probe.
- **Not exported from the module barrel.** The file's docblock states it is "wiring, not published language"—import it by path, not via the observability index.
- **Stryker annotations** wrap the `logger.warn` block, indicating that mutation testing for that dead-branch path is intentionally suppressed.
