---
source: src/modules/users/module.ts
sha256: 2562c3180e80f7ff5d2b13f5c954e262cbae45caa66fdc0d622ca762663e106f
generated_at: 2026-11-14T22:23:28.634060+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/module.ts

## Purpose

Module manifest for the `users` domain object. It declares the routes, event subscriptions, personal-data export sections, reencryption hook, and job registrations that the kernel uses to wire the module into the running application. It also resolves cross-module `personalData.erase` / `minimise` hooks at registration time so that hard-deleting a user cascades through every other module in a single transaction.

## Key elements

- **`onRegistered(modules)`** – Called by the kernel after all modules are known. Resolves every module's `personalData.erase` and `minimise` hooks via `@kernel/registry` and stores them in `./erasure-registry` for the hard-delete path to consume.
- **`publicEvents`** – Maps the internal domain events `USER_ERASED` and `USER_PROFILE_CHANGED` to webhook-visible shapes (`user.erased`, `user.updated`). Payloads are deliberately minimal (userId + changed-field names) to avoid leaking PII into logs.
- **Default export (`AppModule`)** – The manifest object:
  - `mounts` – Two route trees (`./routes` and `./role-routes`) under `/users`.
  - `subscribe` – Listens for `USER_ERASED` and calls the analytics provider's `forget(userId)`; a rejection causes the outbox to retry and eventually dead-letter.
  - `imageTargets` – Exposes `userRepository.writebackImage` so the shared image pipeline can write back to this collection.
  - `personalData` – Two export sections (`profile`, `signInMethods`) that `account`'s GDPR assembly calls when exporting a user's data.
  - `reencrypt` – `reencryptUserPhones` for key-rotation of the phone PII field.
  - `config` – Re-exports `usersConfig` (PII encryption key material) from `./config`.

## Relationships

- **`src/kernel/registry.ts`** – Supplies the `AppModule` and `PublicEventTarget` types plus `resolvePersonalDataErasers` / `resolvePersonalDataMinimisers` used in `onRegistered`. The kernel iterates over this module's manifest at boot.
- **`src/kernel/events.ts`** – Provides `onDomainEvent` (used in `subscribe`) and the `DomainEventMap` type that types the `publicEvents` payloads.
- **`src/infrastructure/observability/analytics/index.ts`** – `resolveAnalyticsProvider()` is called in the `USER_ERASED` handler to notify the analytics backend of a deletion.
- **`src/modules/users/events.ts`** – Source of the `USER_ERASED` and `USER_PROFILE_CHANGED` event-name constants.
- **`src/modules/users/erasure-registry.ts`** – Receives the resolved eraser/minimiser lists via `setPersonalDataErasers` / `setPersonalDataMinimisers`; the hard-delete service reads them back.
- **`src/modules/users/config.ts`** – Provides `usersConfig` (PII encryption key configuration) referenced in the manifest's `config` field.
- **`src/modules.ts`** – The top-level module array that includes this module, making it discoverable by the kernel's registration loop.
- **Invoicing / Stats integration tests** – Exercise user-related flows (credit notes, retention, stats aggregation) that read from or act on the user record this module owns.

## Notes

- The user document is a **shared kernel** between this module and `account`: both read/write the same repository (`userRepository`). There is no separate `account` collection. This is why `account` is deliberately *not* in this file's import graph.
- `personalData.profile` returns `undefined` when the subject's own row no longer exists; `account`'s export assembly handles that specific 404.
- `USER_PROFILE_CHANGED` exposes only the list of changed field names, not their new values, to keep fresh PII out of webhook payloads and logs.
- The analytics `forget` call is fire-and-forget from the user's perspective but is outbox-backed: a failure parks the event as `dead` and triggers alerting rather than silently dropping it.
- `imageTargets` exists because `account`'s signup/profile flows write through `userRepository` directly; the image pipeline needs a registered writeback target per collection name.
