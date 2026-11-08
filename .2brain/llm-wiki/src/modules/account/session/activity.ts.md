---
source: src/modules/account/session/activity.ts
sha256: ac6d6b0196698033b7fd7aa041eb991f7cf79fd68906f9c5ee75e1f253d13381
generated_at: 2026-11-08T04:26:12.045616+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/activity.ts

## Purpose

Stamps an account's `lastActiveAt` timestamp whenever a session is minted or renewed. This shared utility serves both session strategies (cookie and JWT) and provides the clock that the inactivity reaper reads to decide when to expire a session.

## Key elements

- **`recordActivity(userId: string): Promise<void>`** — The sole export. Calls `userService.touchLastActive(userId)` to update the account's activity stamp. Never rejects: any failure is caught, logged as a warning, and silently swallowed so that a valid session is never invalidated by a bookkeeping write.

## Relationships

- **`src/modules/users/index.ts`** — Imported as `@modules/users`; supplies the `userService` instance whose `touchLastActive` method performs the actual DB update.
- **`src/modules/users/services/index.ts`** — Implements the service-layer `touchLastActive` call; also houses the once-a-day write throttle (noted in the JSDoc as living in the users repository).
- **`src/infrastructure/adapters/logger.ts`** — Imported for the `logger.warn` call that fires when the stamp write fails.
- **`src/modules/account/session/cookie-strategy.ts`** / **`src/modules/account/session/jwt.ts`** — Downstream consumers that invoke `recordActivity` at session-mint and keep-alive points.

## Notes

- The function is fire-and-forget by design: it always resolves (never rejects), so callers do not need to `.catch` it. A lost stamp only costs a slightly stale `lastActiveAt` reading.
- The once-a-day throttle is **not** in this file — it lives in the users repository layer. Do not add throttling logic here.
- The `// Stryker disable next-line all` comment suppresses mutation-testing on the single `logger.warn` line, acknowledging that removing the catch would break the "never rejects" contract.
