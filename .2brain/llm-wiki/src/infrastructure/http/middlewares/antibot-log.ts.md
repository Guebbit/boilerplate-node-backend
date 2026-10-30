---
source: src/infrastructure/http/middlewares/antibot-log.ts
sha256: aebcf60b0046121d357a2c0c5a6462989894b88cdf1bee6dfef677544b65bb62
generated_at: 2026-10-29T02:01:47.060622+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/antibot-log.ts

## Purpose

Provides the single shared log shape and HTTP-refusal response helper used by every anti-automation "rung" (rate-limit, email-policy, human-challenge). Exists so that three separate enforcement points emit one consistent warn-log line and one consistent error envelope, rather than each file defining its own message format.

## Key elements

- **`AntibotRung`** — Discriminant union (`'rate-limit' | 'email-policy' | 'human-challenge'`) identifying which enforcement layer refused. Matches the names published under `rungs` in `GET /antibot/config`.
- **`logAntibotRefusal(rung, method, path, status)`** — Emits a single `logger.warn` line with a structured context object. Accepts primitive args (not `Request`/`Response`) so service-layer callers (email-policy in the signup flow) can log without middleware access.
- **`refuseAntibot(rung, request, response, status, errors)`** — Calls `logAntibotRefusal`, then delegates the HTTP reply to `rejectResponse`. Returns the Express `Response`. Keeps status/code/message caller-controlled so 429 vs 403 semantics are preserved.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imports `logger`; all warn-level output goes through this adapter.
- **`src/infrastructure/http/response.ts`** — Imports `rejectResponse` and the `ResponseErrorItem` type; `refuseAntibot` delegates the actual HTTP write to `rejectResponse` rather than setting `res.status().json()` directly.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Consumer; calls `refuseAntibot` with rung `'rate-limit'` to log and answer 429s through the shared envelope instead of express-rate-limit's default plain-text body.
- **`src/infrastructure/http/middlewares/human-challenge.ts`** — Consumer; calls `refuseAntibot` with rung `'human-challenge'` for 403 challenges.
- **`src/modules/account/controllers/post-signup.ts`** — Consumer; calls `logAntibotRefusal` directly (rung `'email-policy'`) from inside a service/controller where no middleware `Request`/`Response` pair is available, and for the 201 ruse where the logged status reflects the true intent.

## Notes

- The `status` parameter is whatever the caller *actually* sends (or intends to send). For rung 2's "201 ruse" the HTTP response returns 201 but the log records the true refusal status — the response intentionally lies to the bot while the log tells the truth.
- Stryker mutation-testing is disabled (`// Stryker disable all`) around the `logger.warn` call because the log string/format is the contract other tools parse; mutations there are noise.
- This file deliberately avoids importing Express `Request`/`Response` into `logAntibotRefusal` so it remains callable from non-middleware contexts. `refuseAntibot` is the only function that touches the Express objects.
