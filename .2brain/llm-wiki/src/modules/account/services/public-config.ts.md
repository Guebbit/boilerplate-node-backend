---
source: src/modules/account/services/public-config.ts
sha256: b81e0eb958c4a0091835dd03a311a237591ce7048aea867136f19fdc4af3367d
generated_at: 2026-11-08T04:21:19.337388+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/public-config.ts

## Purpose

Assembles the account module's slice of the `GET /config` response: the session mode, tier-based lifetimes, optional staff cap, and the list of configured OAuth providers. The values are public (no auth required) and constant for the life of the process, so a client can read them once at boot instead of maintaining its own feature switches.

## Key elements

- **`sessionConfig(): SessionConfig`** — Returns the session mode, per-tier lifetimes (`short` / `medium` / `long` via `RememberTier`), and conditionally `staffLifetimeSeconds` (omitted when the value is 0, which means the cap is off).
- **`oauthProviders(): string[]`** — Returns the array of provider identifiers that have credentials configured in this deployment; empty array when none are set.

## Relationships

- **`src/modules/account/session/config.ts`** — Supplies `getSessionMode()`, `getExpiryTime(RememberTier)`, and `getStaffLifetimeSeconds()`, the raw values this file shapes into the public `SessionConfig` object.
- **`src/modules/account/oauth/providers/index.ts`** — Supplies `enabledProviders()`, which this file passes through as `oauthProviders()`.
- **`src/types/index.ts`** — Provides the `RememberTier` enum (used to select tiers) and the `SessionConfig` interface (the return type contract).
- **`src/modules/account/services/index.ts`** — The barrel file that re-exports this module so consumers import from `services` rather than the individual path.

## Notes

- The `staffLifetimeSeconds` property is **conditionally spread** (`...(x > 0 && {…})`). Clients must treat its absence (not just `0`) as "no staff cap."
- Both exports are arrow-function constants (not bare values), meaning the underlying getters are called on each invocation. This matters if any upstream config is read dynamically, though the module JSDoc states the values are constant for the process.
