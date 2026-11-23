---
source: src/infrastructure/http/middlewares/human-challenge.ts
source_sha256: 464aaa2c79db077744629634f875ba52a79d66af68c855601730fe965d44c8bd
context_sha256: 80ee626370b7687315a4670d8ac9eaee4599f76f41ee5161bb92d1555ae575df
generated_at: 2026-11-22T02:49:31.068235+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/middlewares/human-challenge.ts

## Purpose
Express middleware gate that `signup`, `reset` and `contact` mount when a human-challenge (antibot) provider is selected. The caller must send a token that the active provider vouches for. With the default `none` provider the gate does a single registry lookup and calls `next()`, with no header parsing and no network call.

## Key elements
- `humanChallengeGate` (exported `RequestHandler`):
  - If `isHumanChallengeEnabled()` is false, it calls `next()` and returns.
  - Otherwise it resolves the provider and reads the `antibot-challenge-token` header.
  - A missing token is refused.
  - Otherwise it calls `provider.verify(token, request.ip)`. A verdict of `'ok'` calls `next()`; any other verdict is refused.
  - If `verify` rejects, the request is refused.
- `TOKEN_HEADER` (private constant): `'antibot-challenge-token'`. A header is used so one gate fits any request shape.
- `refuse` (private): calls `refuseAntibot('human-challenge', request, response, 403, [...])`. The error entry has code `ERROR_CODES.ANTIBOT_VERIFICATION_FAILED` and the message `t('generic.error-antibot-verification-failed')`.

## Relationships
- `src/infrastructure/adapters/antibot-providers/index.ts`: supplies `isHumanChallengeEnabled` and `resolveHumanChallengeProvider`. The returned provider's `verify` does the actual check.
- `src/infrastructure/http/middlewares/antibot-log.ts`: `refuseAntibot` writes the shared error envelope and logs the refusal.
- `src/infrastructure/i18n/index.ts` (`t`): localizes the refusal message. `src/infrastructure/i18n/context.ts` is also a graph neighbor, but this file does not use it directly.
- `@api/error-codes`: provides `ANTIBOT_VERIFICATION_FAILED`.
- `src/modules/account/routes.ts`, `src/modules/tasks/routes.ts`: related by the dependency graph. The header says `signup`, `reset` and `contact` mount this gate.
- `src/modules/account/rate-limits.ts`, `src/modules/payments/rate-limits.ts`: listed as graph neighbors, but the file shows no direct interaction with them.
- `tests/unit/infrastructure/http/middlewares/human-challenge.test.ts`: unit tests for this middleware.

## Notes
- The gate is fail-closed. A missing token, a non-`'ok'` verdict and a provider that throws all return a 403.
- The provider is resolved before the token check, so a missing token still resolves the provider when the gate is enabled.
- The refusal message is produced by `t(...)` when `refuse` runs, so it is not fixed at module load.
