---
source: src/modules/users/events.ts
sha256: 87ca00517effdd6cf64783f9ae6ae62f1485f9d10383d5e8a334a036ee44bcfd
generated_at: 2026-09-27T15:37:11.548902+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/events.ts

## Purpose
Declares the domain events owned by the users module by augmenting the kernel's `DomainEventMap` interface, so the event catalogue grows per-module without a shared enumeration file.

## Key elements
- **`declare module '@kernel/events'`** — TypeScript module augmentation that adds the users module's payload types to the global `DomainEventMap`.
- **`'user.setup-requested': { userId: string }`** — Event emitted (per the comment, by `userService.create`) when an admin creates a user without a password and a setup email is queued. The `account` module is the expected subscriber.
- **`USER_SETUP_REQUESTED`** (exported const) — String literal `'user.setup-requested'`; the runtime token used to emit or subscribe to the event.

## Relationships
- **`src/modules/users/service.ts`** — `userService.create` is documented as the emitter of `user.setup-requested`.
- **`src/modules/users/index.ts`** — Likely re-exports the `USER_SETUP_REQUESTED` constant and/or the augmented type for consumers.
- **`src/modules/users/module.ts`** — Module registration; this file's event declaration is what the module "owns."
- **`src/modules/users/tests/integration/service.test.ts`** — Integration tests that exercise the creation flow and can assert the event is emitted with the expected `{ userId }` payload.

## Notes
- The event is *declared* here but *emitted* in `service.ts` and *consumed* by the `account` module. This file contains no runtime logic beyond the exported constant.
- Payload type is intentionally minimal (`{ userId: string }`); the subscriber is responsible for looking up the user and sending the email.
