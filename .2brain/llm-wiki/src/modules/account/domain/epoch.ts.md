---
source: src/modules/account/domain/epoch.ts
sha256: 39059feec683a6993527a247f739830935ac610964ef5a577b01d832787d81bc
generated_at: 2026-10-29T02:33:33.129400+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/domain/epoch.ts

## Purpose

Centralises the single "session epoch" rule: a token (or a login proof) is invalid if it predates the account's `tokensValidAfter` timestamp. Keeping the comparison in one pure module guarantees the resolver, the refresh path, and the mint all apply the identical cutoff and cannot drift apart.

## Key elements

- **`predatesSessionEpoch(authTime: number, tokensValidAfter: Date | undefined): boolean`** — Returns `true` when a token's `auth_time` claim (epoch **seconds**) is strictly before the epoch boundary. Compares in whole seconds (`Math.floor`), so a token stamped in the same second as the bump is still accepted — preserving the caller's freshly re-minted session.
- **`proofPredatesEpoch(provedAt: number, tokensValidAfter: Date | undefined): boolean`** — Returns `true` when a login proof was *begun* (epoch **milliseconds**) before the epoch moved (e.g. a password changed mid-verification). No same-second grace: at mint time there is no re-minted session to protect.
- Both accept `tokensValidAfter` as `Date | undefined`; `undefined` means no epoch event has ever occurred and the check is always `false`.

## Relationships

- **`auth-context.ts`** — calls `predatesSessionEpoch` in the resolver to reject stale tokens before they are acted upon.
- **`jwt.ts`** — invokes `predatesSessionEpoch` on the refresh path so a refreshed token still carries an `auth_time` that must clear the epoch.
- **`mint-guard.ts`** — uses `proofPredatesEpoch` to abort a mint when the underlying login proof predates a concurrent password change.
- **`epoch.test.ts`** — unit-tests both exports (boundary seconds, undefined epoch, millisecond vs. second resolution).

## Notes

- The two functions deliberately use **different time resolutions** (seconds vs. ms). Do not "unify" them: the second-grace in `predatesSessionEpoch` is the mechanism that lets a re-mint survive its own bump; the lack of grace in `proofPredatesEpoch` closes the race where a password change lands during verification.
- Both are pure — no I/O, no Date mutation. They are safe to call from any context (sync resolver, async refresh, mint guard) without ordering concerns.
