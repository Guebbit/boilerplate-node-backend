---
source: src/modules/account/services/public-config.ts
source_sha256: b81e0eb958c4a0091835dd03a311a237591ce7048aea867136f19fdc4af3367d
context_sha256: 4fd7a429105dbbf09c2e849ff665e1384c506d92edc3885a505e4abc3c176391
generated_at: 2026-11-22T03:40:11.424676+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/public-config.ts

## Purpose
Provides the account module's contribution to the public `GET /config` response: how this deployment keeps users signed in, and which OAuth providers it has credentials for. The values are public and constant for the life of the process, so clients can adapt at boot rather than hard-coding their own logic.

## Key elements
- `sessionConfig(): SessionConfig`: builds the session settings object.
  - `mode`: from `getSessionMode()`.
  - `lifetimeSeconds`: `short`, `medium` and `long` entries, each from `getExpiryTime(RememberTier.<tier>)`.
  - `staffLifetimeSeconds`: included only when `getStaffLifetimeSeconds()` is greater than 0. A value of 0 means the cap is switched off, so the key is omitted.
- `oauthProviders(): string[]`: returns `enabledProviders()`. The list is empty when no providers are configured.

## Relationships
- `../session/config`: supplies `getSessionMode`, `getExpiryTime` and `getStaffLifetimeSeconds`, the source of every value in `sessionConfig`.
- `../oauth/providers`: supplies `enabledProviders`, which `oauthProviders` wraps.
- `@types` (`src/types/index.ts`): provides `RememberTier` (used at runtime to select the lifetime tiers) and the `SessionConfig` type for the return value.
- `src/modules/account/services/index.ts`: sits alongside this file in the services barrel. The file itself shows no import from it.

## Notes
- Both exports are functions rather than constants, so they read the underlying config on each call.
- `staffLifetimeSeconds` is optional in the output. Consumers should treat its absence as "no staff cap".
