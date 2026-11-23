---
source: src/modules/account/domain/epoch.ts
source_sha256: 39059feec683a6993527a247f739830935ac610964ef5a577b01d832787d81bc
context_sha256: 17a20e845b3af97703685e4f61c0c58fee14e99c7b83948dd71121ac4fee47a8
generated_at: 2026-11-22T03:28:30.741577+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/domain/epoch.ts

## Purpose
Holds the session epoch rule in one pure module: a token, or a login's proof, is refused if it predates the account's `tokensValidAfter`. Keeping it in one place stops the resolver, the refresh path and the mint from drifting apart.

## Key elements
- `predatesSessionEpoch(authTime, tokensValidAfter)`: reports whether the token's `auth_time` (epoch seconds) is less than `tokensValidAfter` floored to whole seconds. When `tokensValidAfter` is undefined (no event ever moved the epoch), the token does not predate it.
- `proofPredatesEpoch(provedAt, tokensValidAfter)`: reports whether `provedAt` (epoch milliseconds, when the proof's check began) is less than `tokensValidAfter` in milliseconds. When `tokensValidAfter` is undefined, the proof does not predate it.

## Relationships
- Neighbors in `src/modules/account/session/`: `auth-context.ts`, `jwt.ts`, `listing.ts` and `mint-guard.ts` are linked to this file in the dependency graph. The file's own doc names the resolver, the refresh path and the mint as the shared callers. It does not say which neighbor is which, so check those files for the actual calls.
- `src/modules/account/tests/unit/epoch.test.ts`: unit tests for these functions.

## Notes
- The token check uses `auth_time`, not `iat`. A `/refresh` resets `iat` but copies `auth_time` forward from the login. Only a re-login or a re-mint after the epoch moves can clear it.
- The token check compares in whole seconds, the claim's resolution. A token stamped in the same second as the bump is kept, so the caller's re-minted session survives its own bump.
- The proof check compares in milliseconds with no same-second grace. At the mint there is no re-minted session to protect. It catches a password changed while the old one was being verified.
- Don't mix the units. `authTime` is seconds and `provedAt` is milliseconds.
