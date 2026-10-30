---
source: src/modules/users/module.ts
sha256: 96122566cd4620795bbf73ab793337fcc1151c3d85525af580007471dac27eff
generated_at: 2026-10-29T06:13:40.110657+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/module.ts

## Purpose

Module manifest for the **users** domain: admin-facing search, read, write, and soft-delete of user records. It wires together routing, personal-data erasure hooks, public webhook events, a `USER_ERASED` analytics subscription, image writeback, and PII re-encryption into a single `AppModule` object consumed by the kernel registry at startup.

## Key elements

- **`onRegistered(modules)`** – Resolves every enabled module's `personalData.erase` and `personalData.minimise` hooks via the kernel registry and registers them in `./erasure-registry.ts` so the hard-delete path can fan out in one transaction.
- **`publicEvents`** – Maps `USER_ERASED` → `user.erased` and `USER_PROFILE_CHANGED` → `user.updated` to minimised public payloads (user ID + changed-field names only; no personal values in the log).
- **`subscribe()`** – Listens for `USER_ERASED` and calls `resolveAnalyticsProvider().forget(userId)`. Rejection is expected to trigger the outbox retry / dead-letter path.
- **`imageTargets.users.writeback`** – Exposes `userRepository.writebackImage` so the kernel's image-pipeline can write back user avatars/profile images.
- **`personalData`** – Two export sections: `profile` (full row via `userService.findByIdWithCredentials`; returns 404 when the row is gone) and `signInMethods` (linked providers + armed factors, no secrets).
- **`reencrypt`** – Points to `userService.reencryptUserPhones` for the PII-encrypted phone field.
- **`config`** – Exposes `usersConfig` (the PII encryption key entry from `./config.ts`).
- **Default export** – Satisfies `AppModule`; declares `name: 'users'`, mounts the router at `/users`, registers locales, templates, and `usersJobs`.

## Relationships

- **`src/kernel/registry.ts`** – Source of the `AppModule` / `PublicEventTarget` types and the `resolvePersonalDataErasers` / `resolvePersonalDataMinimisers` helpers used in `onRegistered`.
- **`src/kernel/events.ts`** – Provides `onDomainEvent` and the `DomainEventMap` type used to type the `USER_ERASED` / `USER_PROFILE_CHANGED` payloads.
- **`src/infrastructure/observability/analytics/index.ts`** – `resolveAnalyticsProvider` is called in the `USER_ERASED` subscription to forget the user's analytics ID.
- **`src/modules/users/events.ts`** – Defines the `USER_ERASED` and `USER_PROFILE_CHANGED` event constants referenced here.
- **`src/modules/users/erasure-registry.ts`** – Receives the resolved eraser/minimiser lists via `setPersonalDataErasers` / `setPersonalDataMinimisers`.
- **`src/modules/users/repository.ts`** – `userRepository.writebackImage` is exposed as the image writeback target.
- **`src/modules/users/config.ts`** – `usersConfig` is sliced into the manifest's `config` array.
- **`src/modules/users/jobs.ts`** – `usersJobs` is passed into the manifest for the kernel's job scheduler.
- **`src/modules.ts`** – Aggregates this manifest (alongside other modules) when building the enabled-module list handed to `onRegistered`.

## Notes

- **One-way dependency rule:** other modules (cart, addresses, …) hold arrows *into* `users` but never write to the user document directly. Hard-delete is the only cross-module write, and it runs every module's erase hook in a single transaction.
- **`account` is a co-writer, not a graph neighbour:** signup and profile-update flows in the `account` module write through the same `userRepository`. This file's `imageTargets` and `personalData` sections exist so `account` can resolve them without importing `users` directly.
- **Public-event payloads are deliberately minimal:** `user.updated` ships only `userId` + `changed` (field names), never the new values, to avoid duplicating PII into webhook logs.
- **Analytics forget is best-effort-by-design:** a rejection doesn't crash the erase flow; the outbox parks the message as `dead` and raises an alert rather than silently dropping it.
