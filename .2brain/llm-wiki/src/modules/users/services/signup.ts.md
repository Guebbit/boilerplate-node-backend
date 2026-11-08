---
source: src/modules/users/services/signup.ts
sha256: 5669c5d016dca2b22b56a4dd83b1458ff004d18fa58dcafb3253a289427af8f2
generated_at: 2026-11-08T08:52:16.252133+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/signup.ts

## Purpose
Thin service layer for every account-creation path in the system: self-service signup, OAuth-vouched signup, the anti-automation decoy response, and attaching/detaching federated identities. Each entry point is a one-line delegation to `userRepository`, distinguished from its siblings only by a compile-time `Pick<>` field type that encodes which account fields that path is allowed to write.

## Key elements

- **`SignupDecoyFields`** (type) — `Pick<UserDocument, …>` for the decoy path. Excludes `verifiedAt`; the decoy document is *built*, never persisted.
- **`buildSignupDecoy(data)`** — Calls `userRepository.build()` to return a fully-shaped document without writing it. Used to make a policy-refused attempt indistinguishable from a genuine one.
- **`SelfServiceSignupFields`** (type) — `Pick` that deliberately omits `verifiedAt`, `active`, and `oauthAccounts`, so a self-service caller cannot grant itself verified/active status at compile time.
- **`registerSelfService(data)`** — Calls `userRepository.create()`. The account lands in the `unverified` audience; `verifiedAt` is set later by the verification-email flow, not here.
- **`OAuthSignupFields`** (type) — `Pick` that *includes* `verifiedAt`, `active`, and `oauthAccounts`, reflecting provider vouching.
- **`registerFromOAuth(data)`** — Same one-line `userRepository.create()` call as self-service, but typed against `OAuthSignupFields`. Split into a separate function purely so the two field sets are enforced independently at the type level.
- **`unlinkOAuthAccount(userId, provider)`** — Detaches one provider link; returns `false` if the provider was never linked.
- **`linkOAuthAccount(userId, account)`** — Attaches a federated identity to an existing account; returns `false` if the provider is already linked.

## Relationships

- **`../model.ts`** — Source of the `UserDocument` type. Every exported field type in this file is a `Pick<>` over `UserDocument`, so adding or renaming a column there propagates as a compile error here.
- **`../repository.ts`** — Supplies `userRepository`, whose `build`, `create`, `linkOAuthAccount`, and `unlinkOAuthAccount` methods are the actual data-access calls. This file contains no persistence logic of its own.
- **`services/index.ts`** — Barrel/re-export neighbor in the same service directory; consumers import from the barrel rather than from this module directly.

## Notes

- `registerSelfService` and `registerFromOAuth` have **identical runtime bodies** (`userRepository.create(data)`). They exist as separate functions solely so TypeScript rejects a self-service caller that passes `verifiedAt`/`active`/`oauthAccounts`, and an OAuth caller that omits them. Do not merge them.
- `buildSignupDecoy` uses `userRepository.build`, **not** `create` — it intentionally skips any write. The return value is a plain document object for the anti-automation response.
- None of the exported functions contain orchestration (anti-automation checks, duplicate-email pre-check, verification-email send). Those live in the caller layer ("`account`'s OWN orchestration" per the doc comment) and run *around* these calls.
