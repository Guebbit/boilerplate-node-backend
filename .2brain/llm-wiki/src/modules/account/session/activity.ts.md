---
source: src/modules/account/session/activity.ts
source_sha256: 968ab97524564a1ac91fc57d30da16356dacceb63c5ad274fa29dd45c2c54fd9
context_sha256: 931bb358c2daa9a01d84981a9fdab62c696a579d33805e0fbb4c5e6bb572f31a
generated_at: 2026-11-22T03:44:51.243930+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/activity.ts

## Purpose
Records the account's `lastActiveAt` stamp whenever a session is minted or kept alive. This is the clock the inactivity reaper measures, and it is shared by both session modes.

## Key elements
- `recordActivity(userId: string): Promise<void>` — calls `accountUserService.touchLastActive(userId)`. Any rejection is caught and logged as a warning (`'Could not stamp the account as active.'`, with `userId` and `error`), so the returned promise never rejects.

## Relationships
- `src/modules/users/friends/account.ts` — provides `accountUserService`, whose `touchLastActive` performs the actual stamp.
- `src/infrastructure/adapters/logger.ts` — provides `logger`, used to warn when the stamp fails.
- `src/modules/account/session/cookie-strategy.ts` and `src/modules/account/session/jwt.ts` — the two session modes' modules. They are graph neighbors, and the file header says the stamp is shared by both session modes. The file itself does not import them.

## Notes
- Failures are deliberately swallowed. A lost stamp only leaves a stale reading, and a valid session must not fail because of it.
- The once-a-day throttle is not implemented here. It lives in the users repository.
- The failure-logging line carries a Stryker mutation-testing disable comment.
