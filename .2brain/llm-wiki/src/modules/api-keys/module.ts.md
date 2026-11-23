---
source: src/modules/api-keys/module.ts
source_sha256: 7ec423da3f917e487aa4dc87acf6c17a30e8005a23ede80a31579f3007d6472b
context_sha256: d44c0ca8f153e5ec28dce0de56767e8fad109608a13c5693ff0dba7011dd4403
generated_at: 2026-11-22T04:21:57.079947+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/module.ts

## Purpose
Manifest entry for the `api-keys` module, which provides machine-to-machine credentials (mint, list, revoke) and a `CredentialResolver` that lets an `sk_...` bearer token authenticate a request like a JWT. It owns the `apikeys` collection outright; no other module reads or writes it.

## Key elements
- **default export** — the module's `AppModule` manifest (`satisfies AppModule`), with:
  - `name: 'api-keys'` and a single mount at `/api-keys` using `router`.
  - `onRegistered` — calls `registerCredentialResolver({ fromBearerToken })`.
  - `subscribe` — registers two domain-event handlers (below).
  - `locales` and `templates` — paths to `locales/` and `templates/` directories next to the file.
  - `personalData` — one `apiKeys` section with `collect` (`findOwnApiKeys(subject.userId)`) and `erase` (`apiKeysDeleteByUserId(userId, session)`).
- **`onRegistered`** — installs the credential resolver only when the module is enabled.

## Relationships
- `src/kernel/authentication.ts` — supplies `registerCredentialResolver`, the port this module fills with `fromBearerToken` from `src/modules/api-keys/services/resolver.ts`. This mirrors `registerAuthResolver` in `src/modules/account/module.ts`.
- `src/kernel/events.ts` — supplies `onDomainEvent`, used to subscribe to account events.
- `src/kernel/registry.ts` — supplies the `AppModule` type the manifest must satisfy.
- `src/modules/account/index.ts` — exports the `ACCOUNT_SESSIONS_REVOKED` and `ACCOUNT_AUTHENTICATOR_REMOVED` event constants. `account` only announces the events and knows nothing about keys.
- `src/modules/api-keys/routes.ts` — the `router` mounted at `/api-keys`.
- `src/modules/api-keys/services/api-keys.ts` — `revokeAllMintedBy`, `findOwnApiKeys`, `apiKeysDeleteByUserId`.
- `src/modules/api-keys/services/resolver.ts` — `fromBearerToken`.
- `src/modules.ts` is listed as a graph neighbor, presumably where the manifest is collected. The file content does not show this.
- Integration tests under `src/modules/api-keys/tests/integration/` cover activity, the API keys flow, revocation by account events, and the sessions-revoked outbox.

## Notes
- The resolver is registered in `onRegistered`, not at import time. Otherwise anything that merely imports the file (a type, a test) would enable `sk_...` authentication app-wide.
- A key outlives every session. So `ACCOUNT_SESSIONS_REVOKED` (e.g. logout everywhere, password reset) calls `revokeAllMintedBy(userId, reason)`, and `ACCOUNT_AUTHENTICATOR_REMOVED` calls it with the reason `'authenticator-removed'`.
- The `erase` hook runs inside the account-destruction transaction (via `session`). Before it existed, an erased user's key rows stayed in the database. The resolver already refused them once the user was gone.
