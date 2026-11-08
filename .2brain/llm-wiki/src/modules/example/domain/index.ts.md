---
source: src/modules/example/domain/index.ts
sha256: 7df61bf6a879bb06078ae6c9a6de3a1543f70d50d074d2ca48f1c2c2f2c9f0e4
generated_at: 2026-11-08T05:49:37.685804+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/domain/index.ts

## Purpose

Barrel file that re-exports the entire public API of the `example` module's domain layer. It exists so that consumers (services, tests, the module entry point) can import domain rules from a single path without reaching into sub-files. No logic lives here — it is a pure re-export surface.

## Key elements

- **Value re-exports from `./lifecycle`:**
  - `canApply` — checks whether an event may be applied to a given status.
  - `EXAMPLE_EVENTS` — the closed set of valid domain events.
  - `exampleActionsFor` — maps a status to the actions available at that point.
  - `fitsBodyLength` — validates body/length constraint.
  - `initialExampleStatus` — returns the starting status for a new entity.
  - `isPublished` — predicate for the "published" state.
  - `shouldStampPublishedAt` — decides whether a transition sets the `publishedAt` timestamp.
  - `statusAfter` — computes the next status given the current one and an event.
- **Type re-export:**
  - `ExampleEvent` — the union type of all valid domain events.

## Relationships

- **`./lifecycle.ts`** — sole source of every symbol re-exported here; this file adds no behavior.
- **`src/modules/example/index.ts`** — module-level entry point; consumes the domain API so external callers get a single import path.
- **`src/modules/example/services/actions.ts`, `crud.ts`, `owner.ts`, `transition.ts`** — service-layer modules that import domain rules (status guards, event validation, timestamp logic) to keep framework code thin.
- **`tests/unit/domain.test.ts`** — unit tests that import through this barrel (or `./lifecycle` directly) to verify the re-exported rules.
- **`tests/unit/lifecycle.property.test.ts`** — property-based tests targeting `lifecycle.ts`; interact with the same symbols exposed here.

## Notes

- The module-level doc comment encodes a hard convention: the `domain/` folder must contain **pure rules only** — no Express, Mongoose, or any other tier dependency (enforced by lint). If you see a framework import land here, it's a bug.
- Because this file is a flat re-export of one sub-module, adding a second source file under `domain/` (e.g. `rules.ts`) would mean adding a second `export … from` block here. Until then, every export's *origin* is `lifecycle.ts`.
- A design rationale doc is referenced at `docs/theory/domain-layer.md` for when a new module needs its own `domain/` folder.
