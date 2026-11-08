---
source: src/infrastructure/http/middlewares/antibot-log.ts
sha256: 183351dcfb1d5ce86a7e7e7587041e65f6a87747f5ffc4ee52cb5f605be0a170
generated_at: 2026-11-08T03:29:53.912542+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/antibot-log.ts

## Purpose

Single shared log-line and HTTP-refusal helper for every anti-automation "rung" (rate-limit, email-policy, human-challenge). Exists so the three rungs don't each invent their own message format, and so the email-policy check—which runs inside a service rather than a middleware—can still emit the identical log shape.

## Key elements

- **`AntibotRung`** — `type` union of `'rate-limit' | 'email-policy' | 'human-challenge'`. Mirrors the `rungs` key published on `GET /config` so log entries can be filtered by rung.
- **`logAntibotRefusal(rung, method, path, status)`** — Emits one `logger.warn` line (`"Antibot refused {method} {path}"`) with structured fields `{ rung, method, route, statusCode }`. Accepts raw strings/number (not Express objects) so non-middleware callers (e.g. the signup service) can use it.
- **`refuseAntibot(rung, request, response, status, errors)`** — Calls `logAntibotRefusal`, then returns `rejectResponse(response, status, errors)`. Keeps status and error payload caller-controlled (429 vs 403 remain distinct).

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imports `logger`; the sole consumer of the logger in this file (one `warn` call).
- **`src/infrastructure/http/response.ts`** — Imports `rejectResponse` and the `ResponseErrorItem` type; `refuseAntibot` delegates all response-shaping to it.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Expected caller of `refuseAntibot` / `logAntibotRefusal` with `rung: 'rate-limit'`.
- **`src/infrastructure/http/middlewares/human-challenge.ts`** — Expected caller with `rung: 'human-challenge'`.
- **`src/modules/account/controllers/post-signup.ts`** — The "email-policy" rung; calls `logAntibotRefusal` from service context (not a middleware), which is why the function signature avoids full Express objects.

## Notes

- `status` is recorded as the caller *actually* answers. The email-policy rung intentionally sends a 201 "ruse" to the client but logs the true refusal status here—don't assume the logged `statusCode` equals the HTTP status the client sees.
- The log object includes both `method` (in the message string) and `route: path` (structured field); `path` is not duplicated as a key, only `route`.
- Stryker mutation testing is disabled around the `logger.warn` call (`// Stryker disable all` … `// Stryker restore all`) because the side-effect is intentionally untestable via mutation.
- `refuseAntibot` is designed to replace express-rate-limit's built-in plain-text handler; don't also register the default `handler` on the rate-limit middleware alongside it.
