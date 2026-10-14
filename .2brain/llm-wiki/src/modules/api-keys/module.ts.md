---
source: src/modules/api-keys/module.ts
sha256: ef8f9a8a9db8631ff0411e2ebecb17ba398c185585715a2dda9228a6204f2c37
generated_at: 2026-10-14T14:59:07.810649+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/module.ts

## Purpose

Module manifest for the `api-keys` module. Wires together the HTTP routes, the `sk_…` bearer-token credential resolver, a domain-event subscription that revokes keys on session-wide invalidation, and the personal-data (GDPR) obligations for the `apikeys` collection.

## Key elements

- **`onRegistered`** – Called by the kernel once the module is confirmed enabled (D15). Registers `fromBearerToken` (from `./services/resolver`) as the app-wide credential resolver via `registerCredentialResolver`. Deliberately deferred so that merely importing this file in a test or type context does not activate `sk_…` authentication.
- **default export (`AppModule`)** – The manifest object the kernel reads: `name`, `basePath` (`/api-keys`), `routes`, `onRegistered`, `subscribe`, `locales`, `templates`, and `personalData`.
- **`subscribe` callback** – Subscribes to the `ACCOUNT_SESSIONS_REVOKED` domain event (emitted by the `account` module) and calls `revokeAllMintedBy(userId, reason)` to invalidate every key the affected user minted.
- **`personalData` entry** – Declares the module's data obligations:
  - `collect` → `findOwnApiKeys(userId)` for data-export requests.
  - `erase` → `apiKeysDeleteByUserId(userId)` to destroy key rows in the same transaction as the account, preventing orphaned live credentials.

## Relationships

- **`src/kernel/registry.ts`** – Provides the `AppModule` type the manifest satisfies.
- **`src/kernel/authentication.ts`** – Exposes `registerCredentialResolver`; this module fills that kernel port.
- **`src/kernel/events.ts`** – Provides `onDomainEvent` used in the `subscribe` callback.
- **`src/modules/account/index.ts`** – Exports the `ACCOUNT_SESSIONS_REVOKED` event constant that this module listens to.
- **`src/modules/api-keys/routes.ts`** – The Hono/Express router mounted at `/api-keys`.
- **`src/modules/api-keys/services/resolver.ts`** – Supplies `fromBearerToken`, the actual token→principal lookup.
- **`src/modules/api-keys/services/api-keys.ts`** – Supplies the data-access functions (`findOwnApiKeys`, `apiKeysDeleteByUserId`, `revokeAllMintedBy`).
- **`src/modules/api-keys/openapi.yaml`** – Module-scoped OpenAPI spec; referenced by `shared/contracts/openapi.root.yaml`.
- **`src/modules.ts`** – Imports this module's default export to include it in the app's module list.
- **Integration tests** (`tests/integration/*.test.ts`) – Exercise the resolver, revocation-on-session-revoke, and account-erase flows end-to-end.

## Notes

- **Import-time vs. registration-time safety:** The credential resolver is registered inside `onRegistered`, not at module top-level. A file that only `import type { AppModule }` from this path will not enable `sk_…` auth.
- **Ownership of the `apikeys` collection:** The `account` module never touches this collection directly; it only emits `ACCOUNT_SESSIONS_REVOKED`. Revocation logic lives entirely here.
- **Erase ≠ resolver rejection:** Even though the credential resolver refuses tokens once the user row is gone, the `personalData.erase` hook is still required to delete the key *rows* themselves so they don't linger as dead data.
- **Locales & templates paths** are resolved relative to `__dirname`, meaning they must ship alongside the compiled module output.
