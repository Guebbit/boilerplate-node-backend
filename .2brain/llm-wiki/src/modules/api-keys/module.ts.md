---
source: src/modules/api-keys/module.ts
sha256: f05b7a9ec456ec04f029ad7fb31fcb8a5acf9b665b048511f18e91c93f4bca51
generated_at: 2026-09-23T18:24:36.323623+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/module.ts

## Purpose

Module entry point for machine-to-machine API keys. At import time it registers a `CredentialResolver` with the kernel so that `sk_…` bearer tokens authenticate requests, and it exports the module's `AppModule` manifest (routes, permissions, personal-data collector). It owns the `apikeys` collection exclusively and bridges kernel authentication to the module's domain logic.

## Key elements

- **`currentCallerOf(apiKey)`** – Re-derives the minter's *current* caller (roles → permissions via `keysInScope` → `assembleCaller`) on every request, so a key can never exceed the minter's live permissions. Uses `userService.findAuthenticatableById` so a deactivated minter immediately invalidates all their keys.
- **`fromBearerToken(token)`** – The full verify path: `parseApiKeyToken` → `apiKeyRepository.findActiveByPrefix` → `verifyApiKey` (hash compare) → `currentCallerOf` → intersection of stored permissions with `holdsKey(currentCaller, key)`. Every failure mode resolves `undefined`; none throw.
- **`registerCredentialResolver({ fromBearerToken })`** – Side-effectful import-time registration; no explicit wiring call needed elsewhere.
- **`export default`** – The `AppModule` manifest: name, basePath (`/api-keys`), routes, locales path, three permission keys (`apikeys.any.read|create|delete`), and a `personalData` collector that pages through the repository via `readAll`.

## Relationships

- **`src/kernel/authentication.ts`** – Imports `registerCredentialResolver` and the `ResolvedCredential` type; this file fills that kernel port.
- **`src/kernel/permissions.ts`** – Imports `keysInScope` and `assembleCaller` to build the caller object from live role data.
- **`src/kernel/ability.ts`** – Imports `holdsKey` (CASL ability check) to filter the key's stored permissions against the minter's current ability.
- **`src/kernel/registry.ts`** – Imports the `AppModule` type that the default export satisfies.
- **`src/infrastructure/adapters/logger.ts`** – Imports `logger` to catch-and-log the fire-and-forget `touchLastUsed` rejection.
- **`src/infrastructure/persistence/search.ts`** – Imports `readAll` and `MAX_CONFIGURED_PAGE_SIZE` for the personal-data paging loop.
- **`src/modules/access/index.ts`** – Imports `rolesOf` to fetch the minter's current roles.
- **`src/modules/api-keys/credentials.ts`** – Imports `verifyApiKey`, `parseApiKeyToken`, `displayIdOf` for token parsing, hash verification, and credential-ID formatting.
- **`src/modules/api-keys/repository.ts`** – Imports `apiKeyRepository` for `findActiveByPrefix`, `touchLastUsed`, and `search`.
- **`src/modules/api-keys/model.ts`** – Imports the `ApiKeyDocument` type.
- **`src/modules/api-keys/routes.ts`** – Imports `router` for inclusion in the manifest.
- **`src/modules.ts`** – Aggregates this module's default export into the application's module list.

## Notes

- **Import-time side effect:** `registerCredentialResolver` runs when this file is first imported. There is no explicit "init" call; module loading *is* the registration.
- **Permissions are re-derived, never trusted:** The stored `apiKey.permissions` array is intersected with the minter's *live* ability (`holdsKey`) on every request. A demoted or deactivated minter loses access to all their keys on the very next request, without any key document being modified.
- **`touchLastUsed` is fire-and-forget:** The `.catch` is attached inline to convert the rejection into a `logger.warn`, preventing an unhandled-rejection crash. It is deliberately not awaited.
- **All failures resolve `undefined`:** Malformed token, unknown prefix, wrong hash, revoked/expired key, and missing minter all produce the same `undefined` outcome the kernel expects. No error type leaks across the boundary.
- **Manifest permissions are cross-cutting:** `tests/cross-cutting/module-permissions.test.ts` refuses a permission key in the shared contract whose owning module no longer exists—deleting this module must delete its three permission keys.
