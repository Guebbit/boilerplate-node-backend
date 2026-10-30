---
source: src/modules/api-keys/module.ts
sha256: a9f8b8d84199ef4f038c1cb342865a54d931a096d9af460181f783e16755846b
generated_at: 2026-10-29T03:13:29.206060+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/module.ts

## Purpose

Module manifest for the **api-keys** module. Wires together the HTTP routes, the `sk_...` credential resolver, domain-event subscriptions, and personal-data (collect/erase) hooks into a single `AppModule` object that the kernel registry loads at startup.

## Key elements

- **`onRegistered`** — Called by the kernel once the module is confirmed enabled. Registers `fromBearerToken` (from `services/resolver`) as the global `CredentialResolver` via `registerCredentialResolver`. Deliberately deferred out of module scope so that importing the file (for a type, a test, etc.) never silently activates `sk_` authentication.
- **Default export (`AppModule`)** — The manifest entry consumed by the registry:
  - `name: 'api-keys'`
  - `mounts` — Mounts the Express router at `/api-keys`.
  - `subscribe` — Listens on two domain events (see Relationships).
  - `locales` / `templates` — Static asset directories relative to this file.
  - `personalData` — One section (`apiKeys`) with `collect` (returns a user's own keys) and `erase` (deletes all keys for a user in the current transaction).

## Relationships

- **`src/kernel/registry.ts`** — Imports the `AppModule` type that the default export satisfies.
- **`src/kernel/authentication.ts`** — Imports `registerCredentialResolver`; the module fills the kernel's credential-resolver port.
- **`src/kernel/events.ts`** — Imports `onDomainEvent` to subscribe to domain events.
- **`src/modules/account/index.ts`** — Imports the `ACCOUNT_SESSIONS_REVOKED` and `ACCOUNT_AUTHENTICATOR_REMOVED` event constants. The module reacts to both by calling `revokeAllMintedBy`, keeping `account` ignorant of keys.
- **`src/modules/api-keys/routes.ts`** — Imports `router` for the `/api-keys` mount.
- **`src/modules/api-keys/services/resolver.ts`** — Imports `fromBearerToken`, the function handed to the kernel as the credential resolver.
- **`src/modules/api-keys/services/api-keys.ts`** — Imports `findOwnApiKeys` (personal-data collect), `apiKeysDeleteByUserId` (personal-data erase), and `revokeAllMintedBy` (event handler).
- **`src/modules.ts`** — Presumed aggregator that includes this module in the application's module list.
- **`src/modules/api-keys/openapi.yaml`** / **`shared/contracts/openapi.root.yaml`** — OpenAPI contract files describing the endpoints this module exposes.
- **`tests/integration/erasure.test.ts`** and **`src/modules/api-keys/tests/integration/*`** — Integration tests exercising the personal-data erase hook and the event-driven revocation paths defined here.

## Notes

- **Resolver registration is hook-gated, not import-time.** Registering at module top-level would activate `sk_` bearer authentication for any process that merely imports a type or test from this file. The `onRegistered` hook guarantees the resolver is only live when the module is actually enabled.
- **Event direction is one-way.** `account` emits `ACCOUNT_SESSIONS_REVOKED` / `ACCOUNT_AUTHENTICATOR_REMOVED`; this module subscribes and acts. The account module never imports or references api-keys code.
- **Erasure is transactional.** `personalData.erase` runs inside the same transaction as the account's other personal-data sections (addresses, cart, wishlist, payments). Without it, key rows would outlive the account even though the resolver would refuse them at request time.
- **Ownership boundary.** The docstring asserts this module exclusively owns the `apikeys` collection—no other module reads or writes it.
