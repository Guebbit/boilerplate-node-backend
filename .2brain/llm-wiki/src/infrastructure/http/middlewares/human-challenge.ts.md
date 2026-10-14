---
source: src/infrastructure/http/middlewares/human-challenge.ts
sha256: e2edb7f3f161ae43292ce591b0b8cfb728fa025d5fca3d7659ae170c01f8eec1
generated_at: 2026-10-14T07:55:55.640979+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/human-challenge.ts

## Purpose

Express middleware that acts as a gate on sensitive routes (signup, password reset, contact/feedback). It requires the caller to present a token that a human-challenge provider vouches for. When the provider is set to `none`, the gate is a no-op: one registry lookup and a `next()` call, with no header parsing or network I/O.

## Key elements

- **`TOKEN_HEADER`** — Constant (`'x-antibot-challenge-token'`) defining the single HTTP header through which the provider token is conveyed.
- **`refuse`** — Internal helper that delegates to `refuseAntibot` (see `antibot-log.ts`) with a 401 status and the `ANTIBOT_VERIFICATION_FAILED` error code; also handles logging.
- **`humanChallengeGate`** *(exported `RequestHandler`)* — The gate itself. Reads the token header, asks the active provider to `verify(token, ip)`, and either calls `next()` on an `'ok'` verdict or calls `refuse`. A missing header or a provider exception is always a refusal.

## Relationships

- **`infrastructure/adapters/antibot-providers/index.ts`** — Source of `isHumanChallengeEnabled` and `resolveHumanChallengeProvider`. The gate calls the provider's `verify` method returned by the resolver; the port/adapter boundary lives in that module.
- **`infrastructure/http/middlewares/antibot-log.ts`** — Provides `refuseAntibot`, which builds the structured error envelope and emits the log entry on every refusal.
- **`infrastructure/i18n`** — Supplies the `t()` translation function used to localise the error message string.
- **`modules/account/routes.ts`** — Mounts `humanChallengeGate` on account endpoints (signup, password reset).
- **`modules/feedback/routes.ts`** — Mounts `humanChallengeGate` on the contact/feedback endpoint.
- **`modules/account/rate-limits.ts`**, **`modules/payments/rate-limits.ts`** — Co-residents in the same middleware chains; the gate and rate-limiter are composed together on the routes they protect.
- **`tests/unit/infrastructure/http/middlewares/human-challenge.test.ts`** — Unit tests covering the gate's enabled/disabled paths, missing-token refusal, and provider-exception handling.

## Notes

- **Missing token = refusal.** The design treats the absence of the header as "no challenge solved," which is the same shape as a stripped-down script. There is no "pass when no token" fallback.
- **Provider exceptions never pass.** The `.catch(() => refuse(...))` ensures a throwing or hung provider is treated as a rejection, not a silent pass-through.
- **Header-based, not body/query.** Using a header lets the single gate work uniformly across GET, POST, and any other request shape without parsing payloads.
- **`none` provider short-circuit.** When no real provider is configured the gate performs exactly one registry lookup (`isHumanChallengeEnabled`) and calls `next()`; no header is read and no network call is made.
