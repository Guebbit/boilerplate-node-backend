---
source: src/infrastructure/http/middlewares/antibot-log.ts
sha256: df57feec3746615b1d349b85da10ecdbcb852f174de8528ed900450eb989f243
generated_at: 2026-10-14T07:54:48.005155+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/antibot-log.ts

## Purpose

Single shared log-line format and HTTP-refusal helper for all anti-automation rungs (rate-limit, email-policy, human-challenge). Centralises the "refused" log shape so the three rungs don't each emit their own ad-hoc message, and pairs it with the project's standard error-envelope response.

## Key elements

- **`AntibotRung`** (type) — Union `'rate-limit' | 'email-policy' | 'human-challenge'`. Identifies which rung produced the refusal; matches the names published under `rungs` in `GET /antibot/config`.
- **`logAntibotRefusal(rung, method, path, status)`** — Emits one `logger.warn` line with `{ rung, method, route, statusCode }`. Accepts primitive args (not `Request`/`Response`) so the email-policy check inside a *service* (not a middleware) can call it without an Express context. The `status` recorded is the caller's *true* status, which may differ from what the client sees (e.g. rung 2's 201 ruse).
- **`refuseAntibot(rung, request, response, status, errors)`** — Calls `logAntibotRefusal` with the request's method/path, then delegates to `rejectResponse` to send the standard error envelope. Returns the `Response` for Express chaining.

## Relationships

- **`@infrastructure/adapters/logger.ts`** — Source of the `logger` instance used for the warn-level refusal line.
- **`@infrastructure/http/response.ts`** — Provides `rejectResponse` (the shared error envelope) and the `ResponseErrorItem` type used in the `errors` parameter.
- **`rate-limit.ts`** — Calls `refuseAntibot` / `logAntibotRefusal` with rung `'rate-limit'`.
- **`human-challenge.ts`** — Calls the same helpers with rung `'human-challenge'`.
- **`post-signup.ts`** — Calls `logAntibotRefusal` (not the full `refuseAntibot`) from inside the account service for the email-policy rung; it logs the true status even when the response body pretends otherwise (201 ruse).

## Notes

- The `logger.warn` call is wrapped in `Stryker disable/restore all` — mutation testing is intentionally excluded for that line.
- `logAntibotRefusal` deliberately takes `method`/`path`/`status` instead of the Express `Request`/`Response` pair. This is the contract that lets the service-layer email-policy check participate without an HTTP middleware context.
- `refuseAntibot` does **not** pick a status or error code itself; the caller supplies both. A 429 (rate-limit) and a 401 (human-challenge) are distinct and must stay distinct in the response.
