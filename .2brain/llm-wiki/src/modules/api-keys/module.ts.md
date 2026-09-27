---
source: src/modules/api-keys/module.ts
sha256: 63d77576393bc791c951f8fa70996b8f97c34d5ffe310d24812d6b09742358fc
generated_at: 2026-09-27T14:40:56.332046+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/module.ts

## Purpose

The module manifest (entry point) for the **api-keys** module. It declares the module's routes, permission keys, and personal-data lifecycle hooks, and—crucially—wires the `sk_…` bearer-token credential resolver into the kernel at registration time (not import time) so that merely importing the file does not silently enable M2M authentication app-wide.

## Key elements

- **`onRegistered`** – Called by the kernel once the module is confirmed enabled (D15). Calls `registerCredentialResolver({ fromBearerToken })` to plug the `sk_…` resolver into `kernel/authentication.ts`.
- **`export default { … }`** – The `AppModule` manifest:
  - `name: 'api-keys'`, `basePath: '/api-keys'`
  - `routes: router` (from `./routes`)
  - `permissions` – Three keys (`apikeys.any.read/create/delete`) that are owned by this module; a cross-cutting test refuses them in the shared permission file if the module is removed.
  - `personalData` – Declares a single section (`apiKeys`) with `collect` (fetch a user's keys via `findOwnApiKeys`) and `erase` (delete them via `apiKeysDeleteByUserId`) for GDPR account-destroyal.

## Relationships

- **`src/kernel/authentication.ts`** – Consumes `registerCredentialResolver` to install the bearer-token resolver into the shared auth pipeline.
- **`src/kernel/registry.ts`** – Imports the `AppModule` type to satisfy the manifest shape.
- **`src/modules/api-keys/routes.ts`** – Provides the `router` instance mounted under `/api-keys`.
- **`src/modules/api-keys/services/resolver.ts`** – Provides `fromBearerToken`, the actual token-validation logic handed to the kernel.
- **`src/modules/api-keys/services/api-keys.ts`** – Provides `findOwnApiKeys` (personal-data collection) and `apiKeysDeleteByUserId` (account-erasure hook).

## Notes

- The resolver is registered inside `onRegistered`, **not** at top-level module scope. This is deliberate (D15): a type-only import or a test that imports the file must not activate `sk_…` auth for the whole process.
- The `personalData.erase` hook is the same DDD-D6 pattern used by `addresses`, `cart`, `wishlist`, and `payments`. Without it, a deleted user's credential rows would persist even though the resolver would reject them.
- Permission keys are tightly coupled to module existence—see `tests/cross-cutting/module-permissions.test.ts`.
