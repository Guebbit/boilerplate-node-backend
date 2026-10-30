---
source: src/modules/users/services/signup.ts
sha256: 5669c5d016dca2b22b56a4dd83b1458ff004d18fa58dcafb3253a289427af8f2
generated_at: 2026-10-29T06:18:42.436162+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/signup.ts

## Purpose

Service-layer entry points for account creation across four flows (self-service, OAuth-vouched, anti-automation decoy, and OAuth link/unlink). Each flow gets its own narrowly-typed field set so that compile-time errors catch a caller passing fields that only another flow is allowed to set.

## Key elements

- **`SignupDecoyFields`** — `Pick<UserDocument, …>` for the anti-automation decoy; never includes `verifiedAt`.
- **`buildSignupDecoy(data)`** — constructs a `UserDocument` via `userRepository.build()` **without persisting**; the decoy reply looks real but was never written.
- **`SelfServiceSignupFields`** — fields a self-service signup may set; deliberately excludes `verifiedAt`, `active`, and `oauthAccounts`.
- **`registerSelfService(data)`** — delegates to `userRepository.create(data)`; the account starts in an `unverified` state.
- **`OAuthSignupFields`** — fields an OAuth-vouched signup may set; includes `verifiedAt`, `active`, and `oauthAccounts`.
- **`registerFromOAuth(data)`** — delegates to `userRepository.create(data)`; the account is a `customer` from its first request.
- **`unlinkOAuthAccount(userId, provider)`** — removes a provider link; returns `false` if the provider was never linked.
- **`linkOAuthAccount(userId, account)`** — attaches a federated identity; returns `false` if the provider is already linked.

## Relationships

- **`src/modules/users/model.ts`** — source of the `UserDocument` type; every field type in this file is a `Pick<>` over it.
- **`src/modules/users/repository.ts`** — source of `userRepository`; every function here is a one-line delegation to a repository method (`build`, `create`, `unlinkOAuthAccount`, `linkOAuthAccount`).
- **`src/modules/users/services/index.ts`** — barrel file that re-exports this module so consumers import from the services index.

## Notes

- `registerSelfService` and `registerFromOAuth` have **identical one-line bodies** (`userRepository.create(data)`). They are kept as separate functions solely so the narrow field types act as a compile-time guard: passing the wrong field set to the wrong function is a type error.
- The decoy path uses `userRepository.build()` (no write) rather than `.create()`; a policy-refused attempt yields a document indistinguishable from a real one.
- `verifiedAt` is described in the self-service doc comment as "computed, not stored"—the account's `unverified` audience status is derived, not a persisted flag set here.
- `linkOAuthAccount`'s `account` parameter is typed via `Parameters<typeof userRepository.linkOAuthAccount>[1]` to stay in sync with the repository signature without a separate type export.
