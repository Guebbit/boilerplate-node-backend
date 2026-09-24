---
source: src/infrastructure/http/middlewares/antibot-log.ts
sha256: b05f4758bddab6623dda7624c6cabb54b832d319ea19f88553f766bde6226f71
generated_at: 2026-09-23T17:42:51.638512+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/antibot-log.ts

## Purpose

Centralizes the single warn-log format and the single HTTP-refusal response shape shared by every anti-automation rung (rate-limit, email-policy, human-challenge). Eliminates each rung file duplicating its own message structure in the log stream.

## Key elements

- **`AntibotRung`** (type export) — Union of the three rung identifiers: `'rate-limit' | 'email-policy' | 'human-challenge'`. Values match the names published under `rungs` by `GET /antibot/config`.
- **`logAntibotRefusal(rung, method, path, status)`** — Emits one `logger.warn` line with structured fields (`rung`, `method`, `route`, `status_code`). Accepts primitive args (not Express `Request`/`Response`) so non-middleware callers (e.g. the email-policy service in rung 2) can log with the same shape. The `status` is the *true* status, even when the HTTP response intentionally misreports it.
- **`refuseAntibot(rung, request, response, status, errors)`** — Convenience wrapper: calls `logAntibotRefusal` with the request's method/path, then delegates the HTTP reply to `rejectResponse`. Returns the Express `Response`.

## Relationships

- **`@infrastructure/adapters/logger`** — `logAntibotRefusal` calls `logger.warn` with a structured metadata object.
- **`@infrastructure/http/response`** — `refuseAntibot` calls `rejectResponse` to build the error-envelope body; also imports the `ResponseErrorItem` type for its `errors` parameter.
- **`middlewares/rate-limit.ts`** — Imports `refuseAntibot` / `AntibotRung` to log and answer 429 refusals.
- **`middlewares/human-challenge.ts`** — Imports `refuseAntibot` / `AntibotRung` for 401 challenge refusals.
- **`modules/account/controllers/post-signup.ts`** — Calls `logAntibotRefusal` directly (the email-policy rung, rung 2) from inside a service layer where no Express `Request`/`Response` pair is available; may also use `refuseAntibot` for its own refusal path.

## Notes

- `logAntibotRefusal` deliberately takes `method`/`path`/`status` as primitives rather than Express objects. This is an intentional API choice so rung 2 (email-policy) can invoke it from a service context.
- The `status` logged may differ from the HTTP status actually sent to the client. The comment calls out rung 2's "201 ruse" as the motivating example.
- Stryker mutation-testing is disabled around the `logger.warn` call (`// Stryker disable all` … `// Stryker restore all`) — mutations there would not be observable in test assertions.
- `refuseAntibot` does **not** normalize status or message across rungs; a 429 and a 401 retain their distinct semantics in the response body.
