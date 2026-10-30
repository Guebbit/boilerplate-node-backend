---
source: src/modules/example/domain/lifecycle.ts
sha256: 72b813bfd3cb1acff3afeafe8108829e6218f7ad1e596f16cffb62bd5e702379
generated_at: 2026-10-29T03:52:38.294265+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/domain/lifecycle.ts

## Purpose

Declares the example's lifecycle state machine — the three statuses (draft, published, archived), the events that move between them, and a set of pure query helpers the services layer calls to decide what a given caller may do. No I/O; every export is a synchronous decision.

## Key elements

- **`ExampleEvent`** — union type: `'publish' | 'archive' | 'unarchive'`.
- **`EXAMPLE_EVENTS`** — `as const satisfies Record<ExampleEvent, LifecycleEvent<ExampleStatus>>` table mapping each event to its `from`/`to` statuses. This is the single source of truth for allowed transitions.
- **`initialExampleStatus`** — the status a new example starts in (`draft`), read from the `defineLifecycle` result.
- **`canApply(event, status)`** — whether the event is a legal move from the given status.
- **`statusAfter(event)`** — the destination status of an event, regardless of source.
- **`exampleActionsFor(status, permits)`** — combines lifecycle validity with the caller's `update`/`delete` permissions into a full `ExampleActions` object.
- **`isPublished(status)`** — boolean check; used to gate anonymous read access.
- **`shouldStampPublishedAt(nextStatus, alreadyPublishedAt)`** — true only on the *first* transition into `published`; prevents re-publishing after an archive from overwriting the original timestamp.
- **`fitsBodyLength(body, maximum)`** — checks a body string against a deployment-specific character ceiling.

## Relationships

- **`src/domain-primitives/lifecycle.ts`** — supplies `defineLifecycle` (the generic state-machine builder) and the `LifecycleEvent` type; this file is a concrete instantiation of that contract.
- **`src/types/index.ts`** — provides the `ExampleStatus` enum and the `ExampleActions` return type used by `exampleActionsFor`.
- **`src/modules/example/domain/index.ts`** — barrel that re-exports this module's public API to the rest of the codebase.
- **`src/modules/example/services/transition.ts`** — calls `canApply` / `statusAfter` to validate and execute a status change.
- **`src/modules/example/services/actions.ts`** — calls `exampleActionsFor` to build the per-request permission envelope.
- **`src/modules/example/services/crud.ts`** — calls `isPublished`, `shouldStampPublishedAt`, and `fitsBodyLength` during create/read/update/delete.
- **`src/modules/example/services/owner.ts`** — resolves the `permits` argument passed into `exampleActionsFor`.
- **`src/modules/example/tests/unit/domain.test.ts`** / **`lifecycle.property.test.ts`** — unit and property-based tests exercising these helpers.

## Notes

- `EXAMPLE_EVENTS` is the **only** place transitions are declared. Changing a transition means editing this table, not the services.
- A published example is withdrawn only via `archive`; there is no `unpublish` event. Only `archived → draft` is allowed for re-entry.
- `exampleActionsFor` gates **all three** lifecycle moves behind the `update` permission; `delete` is independent. A caller with `update: false` gets all lifecycle actions set to `false` even if the transition is structurally valid.
- `shouldStampPublishedAt` is deliberately idempotent-safe: it returns `false` if `alreadyPublishedAt` is set, so a publish → archive → publish cycle preserves the original date.
- `fitsBodyLength` accepts a caller-supplied `maximum`, implying the ceiling is deployment/config-dependent and may be stricter than the API contract's limit.
