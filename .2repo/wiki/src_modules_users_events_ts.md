# src/modules/users/events.ts

## Purpose

Declares the domain events the `users` module emits by augmenting the kernel's `DomainEventMap` interface. This keeps event definitions colocated with the owning module rather than in a shared catalogue, so the event registry grows organically as modules are added.

## Key elements

- **`'user.deleted'` (interface member on `DomainEventMap`)** — Augments `@kernel/events` to register a hard-delete event with payload `{ userId: string }`. Soft delete intentionally does *not* emit; the event fires and is awaited **before** the destructive write so listeners (e.g. the cart module) see a consistent DB state.
- **`USER_DELETED` (exported const)** — The string literal `'user.deleted'`, exported so emitters and listeners reference one shared symbol instead of two independently-typed literals.

## Relationships

- **`src/modules/users/index.ts`** — Barrel file that re-exports `USER_DELETED` for consumers outside the module.
- **`src/modules/users/module.ts`** — Module definition; imports this file so the augmented event map is visible (side-effect import) and the module can be associated with its events.
- **`src/modules/users/service.ts`** — The service that emits `USER_DELETED` (awaits it before performing the hard delete) and is the primary consumer of the event payload shape.

## Notes

- **Soft delete never emits.** The file's doc block explicitly reasons that a soft delete is reversible and that cleaning up on it would make a subsequent restore lossy. If you see code expecting a `user.soft_deleted` event, it does not exist.
- **Augmentation, not edit.** The event is added via `declare module '@kernel/events'`; do not add events by editing the kernel source.
- **Ordering contract.** Listeners run *before* the write commits. Any listener that depends on the user row still existing will break if this guarantee changes.
