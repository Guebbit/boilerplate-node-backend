---
source: src/modules/users/services/signup.ts
sha256: f725cc20d1635604c38c30de21951ab3f1fd19fd476764a48ba37a65d801c011
generated_at: 2026-11-14T22:31:46.531829+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/signup.ts

## Purpose

Service layer that encapsulates the four account-creation paths (self-service, OAuth-vouched, anti-automation decoy, and the link/unlink operations) and delegates all persistence to the repository. Its primary design goal is compile-time enforcement of which fields each path is allowed to set, so a caller cannot accidentally grant a self-service signup the privileges of a provider-vouched one.

## Key elements

- **`SignupDecoyFields`** / **`buildSignupDecoy(data)`** — Anti-automation deception path. Calls `userRepository.build` (constructs a document *without* persisting). Excludes `verifiedAt`; the returned doc looks real to an attacker but was never written.
- **`SelfServiceSignupFields`** / **`registerSelfService(data)`** — Standard email/password signup. Deliberately excludes `verifiedAt`, `active`, and `oauthAccounts`. Delegates to `userRepository.create`.
- **`OAuthSignupFields`** / **`registerFromOAuth(data)`** — Provider-vouched signup; *may* set `verifiedAt`, `active`, and `oauthAccounts`. Body is identical to `registerSelfService` but the type constraint is the safety mechanism.
- **`unlinkOAuthAccount(userId, provider)`** — Detaches one provider link; returns `false` if the provider was never linked.
- **`linkOAuthAccount(userId, account, session)`** — Attaches a federated identity inside a transaction (same `ClientSession` also deletes the link token). Performs **no** verification itself.

## Relationships

- **`src/modules/users/model.ts`** — Imports the `UserDocument` type; every exported `Pick<>` field type is derived from it.
- **`src/modules/users/repository.ts`** — Imports `userRepository`; every exported function is a thin delegation to a repository method (`build`, `create`, `unlinkOAuthAccount`, `linkOAuthAccount`).
- **`src/modules/users/friends/account.ts`** — Referenced in the `linkOAuthAccount` doc comment: `account` verifies the provider's claim *before* calling this function. No import; the contract is documented, not enforced by this file.

## Notes

- `buildSignupDecoy` uses `userRepository.build` (non-persisting) rather than `create`; this is the only export that does not write to the database.
- `registerFromOAuth` is intentionally kept as a separate function from `registerSelfService` despite an identical one-line body — the *type* is the guard. Merging them would lose the compile-time distinction.
- `linkOAuthAccount` accepts a `ClientSession` parameter, meaning the caller is responsible for wrapping it in a transaction alongside the link-token deletion.
- The `account` module (orchestration layer) is responsible for anti-automation checks, duplicate-email pre-checks, verification emails, and provider verification. This file contains none of that logic.
