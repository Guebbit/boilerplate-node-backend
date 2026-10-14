---
source: src/modules/account/session/activity.ts
sha256: ac6d6b0196698033b7fd7aa041eb991f7cf79fd68906f9c5ee75e1f253d13381
generated_at: 2026-10-14T08:57:46.478484+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/activity.ts

## Purpose

Provides a single fire-and-forget stamp of an account's `lastActiveAt` timestamp, written whenever a session is minted or kept alive. It serves as the input clock for the inactivity reaper and is shared by both session modes (cookie and JWT).

## Key elements

- **`recordActivity(userId: string): Promise<void>`** — Calls `userService.touchLastActive(userId)` and swallows any rejection, logging a warning instead. Guaranteed to never reject; a lost stamp only costs a stale reading, and a valid session must not fail because of it.

## Relationships

- **`src/modules/users/index.ts` → `src/modules/users/services/index.ts`** — `recordActivity` delegates the actual write to `userService.touchLastActive`. The once-a-day write-throttle is enforced in the users repository, not here.
- **`src/infrastructure/adapters/logger.ts`** — Used solely to log a `warn` when the stamp fails.
- **`src/modules/account/session/cookie-strategy.ts`** and **`src/modules/account/session/jwt.ts`** — Both session modes call `recordActivity` after minting or refreshing a session, as stated in the module doc comment ("Shared by both session modes").

## Notes

- The function never throws or rejects by design. Callers can safely ignore the returned promise (or `void` it) without risking a session failure.
- The Stryker mutation-testing disable comment on the `.catch` line is intentional: the logger call is the only effect in the catch, and mutating it would be noise.
- The per-day write throttle is *not* in this file; it lives downstream in the users repository. Do not add throttling logic here.
