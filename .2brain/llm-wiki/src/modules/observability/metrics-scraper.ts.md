---
source: src/modules/observability/metrics-scraper.ts
sha256: 2b9aedf43d749185acb1b411f9a33ec9677bed11efbc0a9091c07b9dbe16ade6
generated_at: 2026-11-08T06:39:31.172347+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/metrics-scraper.ts

## Purpose

Express middleware that guards the single Prometheus scrape route (`GET /observability/metrics`) with a static bearer credential. Prometheus cannot hold a session, so this module's routes don't use the same `read:ObservabilitySnapshot` check; instead this middleware validates a dedicated `NODE_METRICS_TOKEN`. It is deliberately kept beside its route (not in `infrastructure/http/middlewares`) and excluded from the module barrel because it is wiring, not published language.

## Key elements

- **`isMetricsScraper(request, response, next)`** — the sole export. An Express middleware that:
  - Returns **503** if `NODE_METRICS_TOKEN` is unset (deny-by-default).
  - Extracts the token from the `Authorization` header; the `Bearer ` prefix is **required**, not optional — a bare value is treated as absent.
  - Compares the token with `constantTimeEqual` (never `===`) to avoid timing leaks.
  - On mismatch: records a security event (`SECURITY_METRICS_TOKEN_INVALID`) **only** when a non-empty token was supplied (a wrong guess vs. a missing header are different signals), then returns **401**.
  - On success: calls `next()`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `./config` (`observabilityConfig`) | Reads `NODE_METRICS_TOKEN` at request time. |
| `@infrastructure/security/constant-time` (`constantTimeEqual`) | Performs the token comparison. |
| `@infrastructure/http/response` (`rejectResponse`) | Sends the 503 / 401 rejection. |
| `@infrastructure/adapters/logger` | Logs a warning once per request when the token is unset. |
| `@infrastructure/http/request` (`callerContextOf`) | Supplies caller context for the security-event record. |
| `@infrastructure/observability/security-events` (`recordSecurityEvent`) | Emits the `SECURITY_METRICS_TOKEN_INVALID` event on a wrong token. |
| `./audit` (`observabilityAuditActions`) | Provides the audit-action constant used above. |
| `./routes` | The route file that mounts this middleware on `GET /observability/metrics`. |
| `tests/unit/metrics-scraper.test.ts` | Unit tests for the middleware's happy, missing-token, and wrong-token paths. |

## Notes

- **Not in the barrel.** Consumers import this file by path, not via the module index. Adding it to the barrel would publish it as module API.
- **Stryker mutation suppressions** wrap the 503 branch (token-unset path) because that branch is intentionally simple and covered by the warning log, not by token logic.
- The `Bearer ` prefix check is a security decision, not a convenience: accepting a bare token would expand the set of header shapes from which a credential could be read.
- A **missing** `Authorization` header does **not** emit a security event; only a **wrong** non-empty token does. Treat these as different signal types when triaging `security-events` records.
- `NODE_METRICS_TOKEN` is read per-request via `observabilityConfig()`, so a config reload (or test override) takes effect without a process restart.
