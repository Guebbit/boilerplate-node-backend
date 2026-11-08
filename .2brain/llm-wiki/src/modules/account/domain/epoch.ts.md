---
source: src/modules/account/domain/epoch.ts
sha256: 39059feec683a6993527a247f739830935ac610964ef5a577b01d832787d81bc
generated_at: 2026-11-08T04:08:53.362356+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/domain/epoch.ts

## Purpose

Single source of truth for the "session epoch" rule: a token or login proof is invalid if it predates the account's `tokensValidAfter` timestamp. Kept as pure functions so that the resolver, refresh path, and mint path all apply the same check and cannot drift apart.

## Key elements

- **`predatesSessionEpoch(authTime, tokensValidAfter)`** — Returns `true` when a token's `auth_time` claim (epoch **seconds**) is strictly before the epoch. Compares against `Math.floor(tokensValidAfter.getTime() / 1000)`, giving a same-second grace so a re-minted session survives its own epoch bump.
- **`proofPredatesEpoch(provedAt, tokensValidAfter)`** — Returns `true` when a login proof's check time (epoch **milliseconds**) is strictly before the epoch. No same-second grace, because at mint time there is no caller session to preserve.

Both accept `tokensValidAfter: Date | undefined` and return `false` (i.e. "not predating") when the epoch is absent.

## Relationships

- **`session/auth-context.ts`** — Consumes `predatesSessionEpoch` when resolving an incoming token's validity.
- **`session/jwt.ts`** — Produces the `auth_time` claim that `predatesSessionEpoch` later compares; the epoch check is the gate after `iat`-based expiry.
- **`session/mint-guard.ts`** — Calls `proofPredatesEpoch` to reject a login proof that was verified before a password change moved the epoch.
- **`session/listing.ts`** — Applies the same epoch rule when deciding which sessions to surface (only sessions whose tokens don't predate the epoch).
- **`tests/unit/epoch.test.ts`** — Unit tests covering both functions, including the seconds-vs-milliseconds boundary cases.

## Notes

- The two functions intentionally use **different time units** (seconds vs. milliseconds). `predatesSessionEpoch` matches the resolution of the `auth_time` JWT claim and preserves a same-second grace; `proofPredatesEpoch` has no such grace. Do not "unify" them.
- `predatesSessionEpoch` compares `auth_time`, **not** `iat` — `iat` is reset by `/refresh`, while `auth_time` is copied forward from the original login, so only a re-login or post-epoch re-mint clears it.
- Both functions are side-effect-free and depend only on their arguments; safe to call from any layer.
