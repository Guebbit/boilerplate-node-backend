---
source: src/infrastructure/http/middlewares/human-challenge.ts
sha256: cbadab166fd16bef794cb1c847d41ca7170f57e200ec0ea6312abd04b2cc047b
generated_at: 2026-09-23T17:43:20.704923+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/human-challenge.ts

## Purpose

Express middleware gate mounted on `signup`, `reset`, and `contact` routes when a human-challenge provider is configured. It requires the caller to present a token (in a request header) that the active provider will verify; if verification fails or the token is absent, the request is refused with a standard 401 envelope. When no provider is selected (the default `none`), the gate is a near-zero-cost pass-through.

## Key elements

- **`TOKEN_HEADER`** (`'x-antibot-challenge-token'`) — constant header name through which the provider-issued token is transported, keeping the gate agnostic to request shape.
- **`refuse`** (local helper) — thin wrapper around `refuseAntibot` that emits a `401` with the `ANTIBOT_VERIFICATION_FAILED` code and a localized message.
- **`humanChallengeGate`** (exported `RequestHandler`) — the middleware itself:
    1. Short-circuits to `next()` if `isHumanChallengeEnabled()` is `false`.
    2. Reads the token header; a missing token is an immediate refusal.
    3. Calls `provider.verify(token, request.ip)`; an `'ok'` verdict proceeds, anything else refuses.
    4. A provider that **throws** is treated as a refusal (never a pass).

## Relationships

- **`infrastructure/adapters/antibot-providers/index.ts`** — provides the port: `isHumanChallengeEnabled()` (feature flag check) and `resolveHumanChallengeProvider()` (returns the active provider instance with a `.verify` method). The gate is the _consumer_; the adapter package defines the contract.
- **`infrastructure/http/middlewares/antibot-log.ts`** — supplies `refuseAntibot`, the shared helper that formats the error envelope, logs the refusal, and sends the HTTP response. All antibot rejections in the codebase funnel through it for consistent observability.
- **`infrastructure/i18n/index.ts`** (and `context.ts`) — provides the `t()` function used to localize the `ANTIBOT_VERIFICATION_FAILED` message.
- **`modules/account/routes.ts`**, **`modules/account/rate-limits.ts`**, **`modules/feedback/routes.ts`**, **`modules/payments/rate-limits.ts`** — route/rate-limit modules that mount `humanChallengeGate` on the endpoints it protects (signup, password-reset, contact/feedback).
- **`tests/unit/infrastructure/http/middlewares/human-challenge.test.ts`** — unit tests covering the pass-through, missing-token, valid-token, invalid-token, and provider-throw paths.

## Notes

- The gate is **asynchronous** (`.then/.catch` on `provider.verify`) but is declared as a plain `RequestHandler`, not an async wrapper. If the provider's `verify` rejects, the `.catch` handler fires synchronously within the same tick—there is no unhandled-promise risk.
- A **missing header is a refusal**, not a "skip." The rationale (per the module docblock) is that a stripped-down script will simply omit the header; treating absence as a pass would defeat the check.
- The `none` provider (default) makes `isHumanChallengeEnabled()` return `false`, so the gate costs only that one boolean check—no header parsing, no network I/O.
- The error code is always `ANTIBOT_VERIFICATION_FAILED` regardless of _why_ verification failed (bad token, provider error, etc.), intentionally not leaking which specific check tripped.
