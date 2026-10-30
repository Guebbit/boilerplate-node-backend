---
source: src/infrastructure/http/middlewares/human-challenge.ts
sha256: 464aaa2c79db077744629634f875ba52a79d66af68c855601730fe965d44c8bd
generated_at: 2026-10-29T02:02:25.089111+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/human-challenge.ts

## Purpose

An Express middleware gate that verifies a client-supplied anti-bot token before allowing a request to proceed. It is mounted on sensitive routes (signup, password reset, contact/ticket submission) so that only callers holding a token vouched for by the active human-challenge provider can pass. When no provider is configured (the default), the gate is a near-zero-cost pass-through.

## Key elements

- **`humanChallengeGate`** (exported `RequestHandler`) — The middleware. Reads the `antibot-challenge-token` header, calls `provider.verify(token, request.ip)`, and either invokes `next()` on an `'ok'` verdict or refuses with a 403. A missing header or a provider exception is always treated as a refusal.
- **`TOKEN_HEADER`** — The constant `'antibot-challenge-token'`; the single header through which the token travels, keeping the gate agnostic to request shape.
- **`refuse`** (local helper) — Delegates to `refuseAntibot` to emit the shared 403 error envelope (code `ANTIBOT_VERIFICATION_FAILED`) and log the event.

## Relationships

- **`infrastructure/adapters/antibot-providers`** — Supplies `isHumanChallengeEnabled` (fast-path check) and `resolveHumanChallengeProvider` (returns the active provider whose `verify` method is called with the token and client IP).
- **`infrastructure/http/middlewares/antibot-log`** — Supplies `refuseAntibot`, which formats the 403 response body and writes the structured log entry.
- **`infrastructure/i18n`** — Supplies `t()` for the localized error message string.
- **`modules/account/routes.ts`, `modules/payments/routes.ts`, `modules/tickets/routes.ts`** — Mount `humanChallengeGate` on their sensitive endpoints (signup/reset, payment initiation, ticket creation).
- **`tests/unit/infrastructure/http/middlewares/human-challenge.test.ts`** — Unit tests covering the enabled/disabled paths, missing-token, valid-token, and provider-throws cases.

## Notes

- The gate is intentionally header-based (not body/query-based) so a single middleware works regardless of the HTTP method or body encoding of the protected route.
- A provider that *throws* is treated as a refusal — the `.catch` on the promise chain never calls `next()`. There is no "fail open" path.
- The `ERROR_CODES` import comes from `@api/error-codes`, not from this file's directory; the code is `ANTIBOT_VERIFICATION_FAILED`.
- The `next()` short-circuit when the provider is disabled means no header parsing, no provider lookup, and no async work occur on the default configuration.
