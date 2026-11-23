---
source: src/modules/example/domain/index.ts
source_sha256: 8b66e4694707d967cc4e423e8db8bdf3faafad98f940b7a977ee7e8426ae8ca0
context_sha256: 47a02725fcd60021c90666c5c874a53c4e75d961c93fc6039ba52d05f40674dc
generated_at: 2026-11-22T05:08:25.089195+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/domain/index.ts

## Purpose
Public barrel for the example module's domain layer. The domain layer holds pure rules only (no Express, Mongoose, or tier dependencies, enforced by lint). This file re-exports the status lifecycle and the two small facts attached to it, so the rest of the module imports from `domain` rather than from `lifecycle` directly.

## Key elements
All re-exported from `./lifecycle`:
- `canApply`: rule for whether an event can be applied.
- `EXAMPLE_EVENTS`: the closed set of lifecycle events.
- `ExampleEvent` (type): the event type.
- `exampleActionsFor`: the actions available for a given status.
- `initialExampleStatus`: the starting status.
- `statusAfter`: the status resulting from applying an event.
- `isPublished`: published-status predicate.
- `shouldStampPublishedAt`: decides whether a published timestamp should be stamped.
- `fitsBodyLength`: body-length check.

The file contains no logic of its own.

## Relationships
- `src/modules/example/domain/lifecycle.ts`: the sole source of every export; this file only re-exports it.
- `src/modules/example/services/actions.ts`, `src/modules/example/services/crud.ts`, `src/modules/example/services/owner.ts`, `src/modules/example/services/transition.ts` and `src/modules/example/index.ts` sit in the dependency graph alongside it, consistent with the services consuming these rules through this barrel.
- `src/modules/example/tests/unit/domain.test.ts` and `src/modules/example/tests/unit/lifecycle.property.test.ts` are unit and property tests covering the domain and lifecycle rules.

## Notes
- Because the layer is lint-guaranteed free of Express, Mongoose and tiers, anything added here must stay pure.
- New lifecycle exports must be added to this barrel explicitly (named re-exports, no `export *`).
