---
source: src/modules/account/session/epoch.ts
sha256: dfd22f1c2cefccf63f812a72ddc26e12ca285a8d0da8f4759888a9f16f3711c4
generated_at: 2026-10-14T08:59:53.019164+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/epoch.ts

## Purpose

Single-source-of-truth rule for session-epoch validation: given a token's `auth_time` and the account's `tokensValidAfter` date, decide whether the token predates the epoch and must be refused. Extracted as a pure function so the resolver path and the refresh path can never drift apart.

## Key elements

- **`predatesSessionEpoch(authTime, tokensValidAfter)`** — returns `true` when `authTime` (epoch seconds, from the token's `auth_time` claim) is strictly less than the epoch seconds of `tokensValidAfter`. Returns `false` when `tokensValidAfter` is `undefined` (no epoch has ever been set) or when the token was stamped in the same second as the bump (strict `<`, not `<=`).

## Relationships

- **`src/modules/account/session/auth-context.ts`** — consumer; applies `predatesSessionEpoch` during the resolver/refresh decision to reject stale tokens.
- **`src/modules/account/session/jwt.ts`** — supplies the `auth_time` claim value passed as the first argument; also the path that re-mints tokens after an epoch bump.
- **`src/modules/account/tests/unit/epoch.test.ts`** — unit tests for `predatesSessionEpoch`.

## Notes

- Compares in **whole seconds** (floors the `Date` to seconds). A token stamped in the very second of the epoch bump is *kept*, which is intentional: it lets a caller's re-minted session survive its own epoch move.
- Deliberately uses the `auth_time` claim, **not** `iat`. `iat` is reset on every `/refresh`; `auth_time` is copied forward from the original login, so only a re-login (or an explicit re-mint after the epoch moves) can clear a predating `auth_time`.
- The function is pure and side-effect-free; it performs no I/O and reads no globals, making it trivially testable and safe to call from any code path.
