---
source: src/modules/example/domain/index.ts
sha256: 7df61bf6a879bb06078ae6c9a6de3a1543f70d50d074d2ca48f1c2c2f2c9f0e4
generated_at: 2026-10-29T03:52:23.050410+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/domain/index.ts

## Purpose

Barrel (re-export) file for the `example` module's domain layer. It exposes the pure-business-rule vocabulary defined in `./lifecycle.ts` under a single import path, keeping the rest of the module (services, tests, the module root) from reaching into sub-paths directly. The domain layer is lint-enforced to contain no Express, Mongoose, or other tier dependencies.

## Key elements

- **`canApply`** — re-exported from `./lifecycle`; presumably validates whether a given event/status transition is permitted.
- **`EXAMPLE_EVENTS`** — re-exported constant; the closed set of valid lifecycle events.
- **`exampleActionsFor`** — re-exported; returns the actions applicable to a given status.
- **`fitsBodyLength`** — re-exported; a small constraint check (likely on a body field's length).
- **`initialExampleStatus`** — re-exported; the default/starting status for a new example entity.
- **`isPublished`** — re-exported; predicate for the published status.
- **`shouldStampPublishedAt`** — re-exported; decides whether a `publishedAt` timestamp should be set during a transition.
- **`statusAfter`** — re-exported; computes the resulting status given a current status and an event.
- **`ExampleEvent`** *(type)* — re-exported from `./lifecycle`; the union type of valid lifecycle events.

## Relationships

- **`src/modules/example/domain/lifecycle.ts`** — Sole source of every export in this file. This index is a thin re-export; no logic lives here.
- **`src/modules/example/index.ts`** — Module root; likely re-exports the domain barrel (or imports specific domain symbols) so consumers can import from the module top level.
- **`src/modules/example/services/actions.ts`**, **`crud.ts`**, **`owner.ts`**, **`transition.ts`** — Service-layer files that import domain rules (e.g., `canApply`, `statusAfter`, `shouldStampPublishedAt`) to enforce business logic without reimplementing it.
- **`src/modules/example/tests/unit/domain.test.ts`** — Unit tests for the domain rules; imports through this barrel or `./lifecycle` directly.
- **`src/modules/example/tests/unit/lifecycle.property.test.ts`** — Property-based tests targeting the lifecycle logic re-exported here.

## Notes

- All symbols originate from a single file (`./lifecycle.ts`). If you need to change an export, edit `lifecycle.ts` and update this barrel if the name or shape changes.
- The JSDoc references `docs/theory/domain-layer.md` for the broader "pure rules only, no tier leakage" convention.
- Because this is a pure re-export with no code, lint rules that block Express/Mongoose imports here are trivially satisfied — the real enforcement lives on `lifecycle.ts`.
