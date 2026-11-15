---
source: src/modules/account/session/activity.ts
sha256: 968ab97524564a1ac91fc57d30da16356dacceb63c5ad274fa29dd45c2c54fd9
generated_at: 2026-11-14T18:55:17.779555+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/activity.ts

## Purpose

Provides a single, fire-and-forget helper that stamps an account's `lastActiveAt` timestamp whenever a session is minted or refreshed. It exists so both session strategies can share one uniform "keep-alive" signal that the inactivity reaper reads, without either strategy owning that concern.

## Key elements

- **`recordActivity(userId: string): Promise<void>`** — The sole export. Calls `accountUserService.touchLastActive(userId)` to write the stamp, then swallows any rejection and logs a warning. Designed to never throw or reject so that session minting/refresh cannot fail because of an activity bookkeeping write.

## Relationships

- **`src/modules/users/friends/account.ts`** — Imports `accountUserService` and calls its `touchLastActive` method to perform the actual write. The once-a-day write throttle is enforced inside the users repository layer, not here.
- **`src/infrastructure/adapters/logger.ts`** — Imports `logger` solely to emit a `warn` entry if the stamp write fails.
- **`src/modules/account/session/cookie-strategy.ts` / `src/modules/account/session/jwt.ts`** — Stated in the module doc comment as the two "session modes" that share this helper; expected callers of `recordActivity`.

## Notes

- This function **never rejects**. A failed stamp is logged at `warn` level and discarded. The design intent (per the doc comment) is that a stale `lastActiveAt` reading is tolerable; a broken session is not.
- The write-frequency throttle (once-per-day) is *not* implemented here; it lives in the users repository. Do not add a throttle in this file.
- A Stryker mutation-testing suppression (`// Stryker disable next-line all`) sits on the `logger.warn` call, meaning the logger invocation is intentionally excluded from mutation coverage.
