# src/modules/users/events.ts

## Purpose

Declares the domain events the users module emits by augmenting the kernel's `DomainEventMap` interface (module augmentation, not a shared edit), and exports typed event-name constants so emitters and subscribers reference a single spelling instead of independent string literals.

## Key elements

- **`declare module '@kernel/events'`** — Augments `DomainEventMap` with two entries:
  - `'user.deleted': { userId: string }` — Emitted *before* the hard-delete write; soft deletes do **not** emit (reversible, cleanup would make restore lossy).
  - `'user.setup-requested': { userId: string }` — Emitted when an admin creates a passwordless user and queues a setup request; the `account` module is the intended subscriber (owns tokens / outbound email).
- **`USER_DELETED`** — String constant for `'user.deleted'`.
- **`USER_SETUP_REQUESTED`** — String constant for `'user.setup-requested'`.

## Relationships

- **`src/modules/users/service.ts`** — The emitter. The setup-requested doc explicitly points to `userService.create`; the deleted event is fired in the hard-delete path within the same service.
- **`src/modules/users/index.ts`** — Barrel file through which `USER_DELETED` and `USER_SETUP_REQUESTED` are re-exported to consumers.
- **`src/modules/users/module.ts`** — Module registration; likely wires listeners/subscribers for these events at module-load time.

## Notes

- Events are typed via interface augmentation, so adding a new user event only touches this file—no shared catalogue needs updating.
- `user.deleted` is **awaited before** the DB write, guaranteeing listeners observe a still-consistent state. Don't emit it after the write.
- The `account` module is called out as the subscriber for `user.setup-requested`; keep that contract if you change the event shape.
