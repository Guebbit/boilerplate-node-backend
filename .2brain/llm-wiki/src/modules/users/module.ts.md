---
source: src/modules/users/module.ts
sha256: 96122566cd4620795bbf73ab793337fcc1151c3d85525af580007471dac27eff
generated_at: 2026-11-08T08:46:51.088321+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/module.ts

## Purpose

The manifest entry that registers the `users` module with the application kernel. It wires up HTTP routes, background jobs, domain-event subscriptions, webhook-visible public events, personal-data export/erase hooks, PII re-encryption, and configuration — all in one object that the kernel's registry consumes at boot.

## Key elements

- **`onRegistered(modules)`** – Called by the kernel once all modules are loaded. Resolves every module's `personalData.erase` and `personalData.minimise` hooks via `@kernel/registry` and stores them in `./erasure-registry.ts` for the hard-delete path.
- **`publicEvents`** – Maps the two internal domain events (`USER_ERASED`, `USER_PROFILE_CHANGED`) to webhook-visible payloads (`user.erased`, `user.updated`). Payloads intentionally omit PII values (only `userId` and a `changed` field list).
- **`subscribe()`** – Registers a `USER_ERASED` listener that calls `resolveAnalyticsProvider().forget(userId)`. A rejection is left to the outbox retry/dead-letter mechanism.
- **Default export (the manifest)** – Declares `name`, `mounts` (router at `/users`), `locales`, `templates`, `jobs`, `publicEvents`, `subscribe`, `imageTargets` (exposes `userRepository.writebackImage`), `personalData` (export sections `profile` and `signInMethods`), `reencrypt` (phone re-encryption), and `config` (PII key reference).

## Relationships

- **`src/kernel/registry.ts`** – Supplies the `AppModule` / `PublicEventTarget` types and the `resolvePersonalDataErasers` / `resolvePersonalDataMinimisers` helpers consumed in `onRegistered`. This file's default export is the object the registry collects.
- **`src/kernel/events.ts`** – Provides `onDomainEvent` and `DomainEventMap`; used both in `subscribe()` and to type the `publicEvents` payload functions.
- **`src/infrastructure/observability/analytics/index.ts`** – `resolveAnalyticsProvider` is invoked in the `USER_ERASED` handler to delete the analytics record.
- **`src/modules/users/erasure-registry.ts`** – Receiving end of the resolved erase/minimise hook lists set during `onRegistered`.
- **`src/modules/users/config.ts`** – Imported as `usersConfig`; its `slice` is exposed as the module's `config` entry (PII encryption key material).
- **`src/modules.ts`** – Top-level module list that includes this manifest; the kernel iterates it to call `onRegistered` and collect all `AppModule` entries.
- **`src/modules/users/asyncapi.webhooks.yaml`** – The async spec describing the same `user.erased` / `user.updated` webhook events defined in `publicEvents`.
- **Invoicing & stats integration tests** – Exercise the users module indirectly (e.g., personal-data erasure cascades, event fan-out) but have no runtime dependency on this file.

## Notes

- The `account` module writes the **same** user document through the shared `userRepository`; there is no separate collection owned by `users`. This keeps the dependency arrow `account → users` one-way.
- `personalData` export: the `profile` section returns `undefined` (→ 404) when the user's own row no longer exists; the `signInMethods` section lists providers and factors **without** secrets (secrets belong to `account`).
- `reencrypt` targets only phone numbers; TOTP secrets on the same document are re-encrypted by `account`, not here.
- Public event payloads are deliberately minimal — the comment warns that including new profile values would duplicate PII into webhook logs.
