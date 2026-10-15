---
source: src/modules/account/session/epoch.ts
sha256: 39059feec683a6993527a247f739830935ac610964ef5a577b01d832787d81bc
generated_at: 2026-10-15T10:06:39.090022+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/epoch.ts

## Purpose

Single source of truth for the session-epoch rule: a token or a login's proof is refused when it predates the account's `tokensValidAfter`. Both checks live here as pure functions so the resolver, the refresh path, and the mint path cannot drift apart.

## Key elements

- **`predatesSessionEpoch(authTime, tokensValidAfter)`** — Returns `true` when a token's `auth_time` claim (epoch **seconds**) is strictly less than `tokensValidAfter` truncated to whole seconds. A token stamped in the same second as the epoch bump is *kept* (same-second grace).
- **`proofPredatesEpoch(provedAt, tokensValidAfter)`** — Returns `true` when a login-proof check began (epoch **milliseconds**) strictly before `tokensValidAfter`. No same-second grace: there is no re-minted caller session to protect at mint time.

## Relationships

- **`auth-context.ts`** — Supplies the account record (including `tokensValidAfter` and the token's `auth_time`) that callers pass into these predicates.
- **`jwt.ts`** — The refresh / re-mint path; after a `/refresh` resets `iat` but copies `auth_time` forward, the resolver re-checks via `predatesSessionEpoch`.
- **`mint-guard.ts`** — The mint path; invokes `proofPredatesEpoch` to reject a login whose proof was verified before a concurrent password change moved the epoch.
- **`src/modules/account/tests/unit/epoch.test.ts`** — Unit tests covering both predicates, including the same-second boundary.

## Notes

- The two functions intentionally use **different time resolutions** (seconds vs. milliseconds). This is not a bug: `predatesSessionEpoch` grants same-second grace so a caller's re-minted session survives its own bump, while `proofPredatesEpoch` has no such grace because at mint time there is no prior session to keep.
- Comparison uses `auth_time`, **not** `iat`. `iat` is reset on every `/refresh`; `auth_time` is copied forward from the original login, so only a re-login or a post-epoch re-mint clears it.
- Both functions are pure and side-effect-free; they never mutate the token or the account record.
