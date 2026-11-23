---
source: src/modules/example/domain/lifecycle.ts
source_sha256: 878791d6eb979937926c46318d6fe930471ee09f379bbba22ab21412ef3a527b
context_sha256: e18f6fea7052a6f3e643b90c71db39a55def0aefb6a8935786509bbac10d14b2
generated_at: 2026-11-22T05:08:33.538341+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/domain/lifecycle.ts

## Purpose
Defines the pure, I/O-free rules for an example's life: statuses `draft`, `published` and `archived`, the events that move between them, and which actions a caller may take. It also holds two small related facts: when to stamp `publishedAt` and whether a body fits a length limit. The transition graph lives only here. The contract carries just the status enum and the `actions` flags.

## Key elements
- `ExampleEvent`: the type `'publish' | 'archive' | 'unarchive'`. Each event matches an endpoint, `POST /examples/{id}/<event>`.
- `EXAMPLE_EVENTS`: the `as const` event table, checked with `satisfies Record<ExampleEvent, LifecycleEvent<ExampleStatus>>`.
  - `publish`: draft → published.
  - `archive`: draft or published → archived.
  - `unarchive`: archived → draft.
- `initialExampleStatus`: the starting status for new examples, which is `draft`.
- `canApply(event, status)`: whether the event is allowed from that status.
- `statusAfter(event)`: the status the event leaves the example in.
- `exampleActionsFor(status, permits)`: builds an `ExampleActions` object. Each lifecycle action is `permits.update && canApply(...)`. `update` and `delete` pass through from `permits`.
- `isPublished(status)`: true only for `published`. The doc comment says it decides whether anyone, signed in or not, may read an example.
- `shouldStampPublishedAt(nextStatus, alreadyPublishedAt)`: true only when the next status is `published` and no stamp exists yet.
- `fitsBodyLength(body, maximum)`: true when `body.length <= maximum`.

## Relationships
- `src/domain-primitives/lifecycle.ts`: supplies `defineLifecycle` and the `LifecycleEvent` type. The table is passed through `defineLifecycle` once at load to get `initial`, `allows` and `toOf`.
- `src/types/index.ts`: supplies `ExampleStatus` and `ExampleActions`.
- `src/modules/example/domain/index.ts`: the domain barrel for this module. Its exact contents aren't visible here.
- The services (`actions.ts`, `crud.ts`, `owner.ts`, `transition.ts`) and the tests (`domain.test.ts`, `lifecycle.property.test.ts`) are listed as graph neighbors. This file's code doesn't say which exports each one uses.

## Notes
- A published example is never "unpublished". It is archived, and only an archived example can return to `draft`.
- Re-publishing after an archive does not move the original `publishedAt` date, because the stamp is set only if none exists.
- `exampleActionsFor` takes the lifecycle moves from the status. Whether the caller may make any of them depends on the `update` key. The `permits` values come from the kernel.
- `fitsBodyLength` checks against the deployment's own ceiling, which may be lower than the contract's.
