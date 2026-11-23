---
source: src/infrastructure/http/middlewares/antibot-log.ts
source_sha256: 183351dcfb1d5ce86a7e7e7587041e65f6a87747f5ffc4ee52cb5f605be0a170
context_sha256: 46dd82454c5804ad593381fbe608a06e053bcf0a4a43f7633afeea13813a4288
generated_at: 2026-11-22T02:48:35.386620+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/middlewares/antibot-log.ts

## Purpose
Provides the single log line and the single HTTP-refusal shape shared by every anti-automation "rung". The `rung` field lets rate-limit, email-policy, and human-challenge refusals be told apart in one log stream, rather than each file formatting its own message.

## Key elements
- `AntibotRung` — type union `'rate-limit' | 'email-policy' | 'human-challenge'`. It matches the names `antibot` publishes under `rungs` on `GET /config`.
- `logAntibotRefusal(rung, method, path, status)` — emits `logger.warn("Antibot refused <method> <path>")` with metadata `{ rung, method, route: path, statusCode: status }`. It takes plain strings and a number instead of `Request`/`Response`, so code that isn't a middleware (rung 2's email-policy check inside a service) can call it too.
- `refuseAntibot(rung, request, response, status, errors)` — calls `logAntibotRefusal` using `request.method` and `request.path`, then returns `rejectResponse(response, status, errors)`.

## Relationships
- `@infrastructure/adapters/logger` — supplies the `logger` used for the warn line.
- `@infrastructure/http/response` — supplies `rejectResponse` and the `ResponseErrorItem` type, so refusals use the shared error envelope.
- `rate-limit.ts` and `human-challenge.ts` (sibling middlewares) correspond to the `'rate-limit'` and `'human-challenge'` rungs. This file's header says they share this logging and refusal shape.
- `post-signup.ts` (account controller) is a graph neighbor. The file's comments mention rung 2's email-policy check, called from a service, and its 201 ruse, but the code doesn't show how `post-signup.ts` uses it.

## Notes
- `status` is whatever the caller actually answers with. For rung 2's 201 ruse, the true status is logged even though the response claims otherwise.
- `refuseAntibot` deliberately avoids express-rate-limit's plain-text body. The caller chooses the status, code, and message, because a 429 and a 403 mean different things.
- The log call is wrapped in `Stryker disable all` / `Stryker restore all`, so mutation testing skips it.
