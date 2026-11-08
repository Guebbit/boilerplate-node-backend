---
source: src/modules/api-keys/module.ts
sha256: fdac1daf6c5dc46c82527a0310d4acfb3d9d55000daefa6c856d5609b831aebd
generated_at: 2026-11-08T05:03:00.082738+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/module.ts

## Purpose

Module registration manifest for the `api-keys` feature. Wires the credential resolver into the kernel, subscribes to account lifecycle events that should cascade-revoke minted keys, and declares the module's personal-data (collect/erase) hooks. It is the single point where the api-keys module's internal services are connected to kernel ports and the domain-event bus.

## Key elements

- **`onRegistered`** — Calls `registerCredentialResolver({ fromBearerToken })`. Deferred to the "registered" lifecycle so that merely importing this file (e.g., for a type in a test) does not silently enable `sk_…` bearer auth for the whole app.
- **`export default` (AppModule manifest)** — The object the kernel loads. Contains:
  - `mounts` — mounts `./routes`' router at `/api-keys`.
  - `subscribe` — registers two domain-event handlers:
    - `ACCOUNT_SESSIONS_REVOKED` → `revokeAllMintedBy(userId, reason)` (logout-everywhere / password-reset cascade).
    - `ACCOUNT_AUTHENTICATOR_REMOVED` → `revokeAllMintedBy(userId, 'authenticator-removed')` (staff 2FA removal cascade).
  - `personalData` — declares an `apiKeys` section with `collect` (`findOwnApiKeys`) and `erase` (`apiKeysDeleteByUserId`) for data-portability and account-erasure flows.
  - `locales` / `templates` — filesystem paths for i18n and UI assets.

## Relationships

- **`src/kernel/authentication.ts`** — Fills the kernel's `CredentialResolver` port by passing `fromBearerToken` into `registerCredentialResolver`.
- **`src/kernel/events.ts`** — Uses `onDomainEvent` to subscribe to account lifecycle events.
- **`src/kernel/registry.ts`** — Imports the `AppModule` type that the default export satisfies.
- **`src/modules/account/index.ts`** — Source of the `ACCOUNT_SESSIONS_REVOKED` and `ACCOUNT_AUTHENTICATOR_REMOVED` event constants the module subscribes to.
- **`src/modules/api-keys/routes.ts`** — Provides the `router` instance mounted at `/api-keys`.
- **`src/modules/api-keys/services/resolver.ts`** — Provides `fromBearerToken`, the function actually used to resolve an `sk_…` token to a user.
- **`src/modules/api-keys/services/api-keys.ts`** — Provides `findOwnApiKeys`, `apiKeysDeleteByUserId`, and `revokeAllMintedBy` used by the subscribe and personalData hooks.
- **`src/modules.ts`** — Uploader/loader that imports this module's default export into the kernel.

## Notes

- **Resolver registration is intentionally deferred.** Registering at import time would let any file that merely pulls in a type from this module activate `sk_…` authentication process-wide.
- **`erase` is load-bearing, not cosmetic.** The credential resolver already refuses keys once the user row is gone, but without the `erase` hook the `apikeys` rows persist. This mirrors the same pattern declared by `addresses`, `cart`, `wishlist`, and `payments` on their own collections.
- **Ownership contract.** The module owns the `apikeys` collection outright; no other module reads or writes it. The `account` module only *announces* lifecycle events and knows nothing about keys.
