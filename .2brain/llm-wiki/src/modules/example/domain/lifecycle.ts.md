---
source: src/modules/example/domain/lifecycle.ts
sha256: 72b813bfd3cb1acff3afeafe8108829e6218f7ad1e596f16cffb62bd5e702379
generated_at: 2026-11-08T05:49:51.794625+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/domain/lifecycle.ts

## Purpose

Pure, I/O-free status-machine definition for the `example` entity. It declares the three lifecycle events (publish, archive, unarchive), validates them against the status enum at module load via `defineLifecycle`, and exposes small query predicates that services use to enforce transitions, compute permissions, and apply side-effect rules (publish-date stamping, body-length ceiling).

## Key elements

- **`ExampleEvent`** — union type: `'publish' | 'archive' | 'unarchive'`.
- **`EXAMPLE_EVENTS`** — `as const` table mapping each event to `{ from: ExampleStatus[], to: ExampleStatus }`; satisfies `Record<ExampleEvent, LifecycleEvent<ExampleStatus>>`.
- **`lifecycle`** (internal) — the `defineLifecycle` instance; checked once at load, not re-evaluated per call.
- **`initialExampleStatus`** — the starting status (`draft`).
- **`canApply(event, status)`** — boolean: is this event legal from this status?
- **`statusAfter(event)`** — the `to` status an event produces.
- **`exampleActionsFor(status, permits)`** — merges lifecycle validity with the caller's row-level permissions (`update`, `delete`) into an `ExampleActions` object.
- **`isPublished(status)`** — simple equality check; used to gate anonymous read access.
- **`shouldStampPublishedAt(nextStatus, alreadyPublishedAt)`** — true only when transitioning *into* `published` for the first time.
- **`fitsBodyLength(body, maximum)`** — deployment-level character-ceiling check, independent of the contract limit.

## Relationships

- **`src/domain-primitives/lifecycle.ts`** — provides `defineLifecycle` (the validation/normalisation engine) and the `LifecycleEvent` type used by `EXAMPLE_EVENTS`.
- **`src/modules/example/domain/index.ts`** — module barrel; re-exports the public surface of this file so consumers import from the domain root.
- **`src/modules/example/services/transition.ts`** — consumes `canApply`, `statusAfter`, and `EXAMPLE_EVENTS` to guard and execute a single event transition.
- **`src/modules/example/services/actions.ts`** — calls `exampleActionsFor` to build the response payload describing what the caller may do.
- **`src/modules/example/services/crud.ts`** — uses `initialExampleStatus`, `shouldStampPublishedAt`, and `fitsBodyLength` during create/update.
- **`src/modules/example/services/owner.ts`** — uses `isPublished` to decide whether a read is permitted without authentication.
- **`src/modules/example/tests/unit/domain.test.ts`** / **`lifecycle.property.test.ts`** — unit and property-based tests asserting transition validity, idempotence, and permission-matrix correctness.
- **`src/types/index.ts`** — source of the `ExampleStatus` enum and `ExampleActions` interface consumed here.

## Notes

- `unarchive` intentionally routes to `draft`, **not** back to `published`. A re-publish must be a separate explicit `publish` event; the original `publishedAt` stamp is preserved (see `shouldStampPublishedAt`).
- `exampleActionsFor` gates *all* event flags on `permits.update`; a caller without `update` can never publish/archive/unarchive regardless of status. `delete` is independent of the lifecycle.
- `fitsBodyLength` is a *deployment* ceiling that may be tighter than the API contract limit; do not confuse the two.
- The event table is `as const` + `satisfies`, so the compiler pins the exact `from`/`to` tuples at the site; adding a new status to the enum without updating the table will be a type error at build time.
