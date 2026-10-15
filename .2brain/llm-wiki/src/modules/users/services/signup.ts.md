---
source: src/modules/users/services/signup.ts
sha256: f64ced40ca20530a27b0a7158582b69346e00516eca08bb749534acb3e0aedf1
generated_at: 2026-10-15T12:12:03.223451+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/signup.ts

## Purpose

Service layer for all account-creation paths: self-service signup, OAuth-vouched signup, the anti-automation decoy, and OAuth link/unlink. Each path is given a narrowly-typed field set (`Pick<UserDocument, …>`) so that compile-time errors catch a caller mixing up which fields are legal for which flow. All persistence is delegated to `userRepository`; this file adds no business logic beyond the type boundary.

## Key elements

- **`SignupDecoyFields`** — field subset the decoy (anti-automation) path may write. Excludes `verifiedAt` by design.
- **`buildSignupDecoy(data)`** — calls `userRepository.build`; constructs a `UserDocument` *without* persisting it, so a policy-refused attempt is indistinguishable from a real one.
- **`SelfServiceSignupFields`** — field subset for self-service signup. Deliberately excludes `verifiedAt`, `active`, and `oauthAccounts` (those belong only to the OAuth path).
- **`registerSelfService(data, session?)`** — calls `userRepository.create`; writes the user row. Does **not** assign a role; the caller grants `unverified` via `assignDefaultRole` in the same transaction.
- **`OAuthSignupFields`** — field subset for OAuth-vouched signup. Includes `verifiedAt`, `active`, and `oauthAccounts`.
- **`registerFromOAuth(data, session?)`** — same one-line `userRepository.create` call as self-service; kept separate solely so the narrower `OAuthSignupFields` type is enforced at the call site.
- **`unlinkOAuthAccount(userId, provider)`** — removes a provider link; returns `false` if the provider was never linked.
- **`linkOAuthAccount(userId, account)`** — attaches a federated identity to an existing account; returns `false` if the provider is already linked.

## Relationships

- **`src/modules/users/model.ts`** — provides the `UserDocument` type; every `Pick<>` field type in this file is derived from it.
- **`src/modules/users/repository.ts`** — provides `userRepository`; every exported function in this file is a thin delegation to one of its methods (`build`, `create`, `unlinkOAuthAccount`, `linkOAuthAccount`).
- **`src/modules/users/services/index.ts`** — sibling service module in the same folder; expected re-export barrel for this file's public API.

## Notes

- `registerSelfService` and `registerFromOAuth` have **identical one-line bodies**. They are intentionally not merged: the distinct `Pick<>` types are the safety mechanism. A caller passing an OAuth field (e.g. `verifiedAt`) into the self-service function will get a compile error.
- Neither create function assigns a role. Role assignment (`unverified` vs `customer`) is the caller's responsibility via `assignDefaultRole` / `assignRole`, committed in the same Mongoose session/transaction.
- The decoy path (`buildSignupDecoy`) **never writes to the database**. It exists purely to produce a plausible-looking response object.
- `session` is a Mongoose `ClientSession`, used to group the user insert and the subsequent role-assignment write into one atomic transaction.
