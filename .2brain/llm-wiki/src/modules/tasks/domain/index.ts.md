---
source: src/modules/tasks/domain/index.ts
sha256: 2856dd41afc769518263eb836b45799838b8df63056bc2bb31ff5560c21e0db7
generated_at: 2026-11-08T08:33:06.821143+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/domain/index.ts

## Purpose

Barrel re-export for the tasks domain layer. It surfaces every public symbol from the five domain submodules (lifecycle, actions, ownership, routing, system) through a single import path, so that service-layer, repository-layer, and test code all pull the same pure business rules from one canonical location.

## Key elements

- **`./lifecycle` exports** — `clear`, `reopen`, `resolve`, `markSpam` (transition functions); `isOpen`, `openKeyOf`, `initialTaskStatus` (status predicates); `OPEN_STATUSES`, `DUE_SOON_MS` (constants); `TaskFacts`, `TaskPatch`, `TaskRefusal`, `Transition` (types).
- **`./actions` exports** — `actionsOf` (derives available actions from facts); `ActionFacts`, `TaskActionFlags` (types).
- **`./ownership` exports** — `ownTasksFilter` (builds a filter for a given owner); `OwnerRef`, `OwnTasksFilter` (types).
- **`./routing` exports** — `CONTACT_ROUTE_SET` (the set of routes a task may be routed to).
- **`./system` exports** — `accountReviewOpening`, `exportFailedOpening` (system-initiated task openings); `SystemOpening` (type).

## Relationships

- **Re-exports from (its direct dependencies):** `./lifecycle`, `./actions`, `./ownership`, `./routing`, `./system` — this file contains no logic of its own; every symbol is a pass-through.
- **Consumed by:** `src/modules/tasks/service.ts`, `src/modules/tasks/repository.ts`, `src/modules/tasks/presenter.ts`, `src/modules/tasks/index.ts`, `src/modules/tasks/services/system.ts`, `src/modules/tasks/services/workflow.ts`, and the unit tests (`lifecycle.test.ts`, `routing.test.ts`, `system-openings.test.ts`). All of these import domain symbols through this barrel rather than reaching into the submodules directly.
- **Type source:** `src/modules/tasks/model.ts` likely defines the shared task shape that the `TaskFacts` / `TaskPatch` types here reference or build upon.

## Notes

- **Purity contract:** The module doc explicitly states the domain layer is *lint-guaranteed* free of Express, Mongoose, and any other tier. Any new re-export here must come from a file that honours that constraint.
- **No local declarations:** This file defines nothing; it is purely an `export { … } from '…'` list. If you need to change *what* is exported, edit the submodule and adjust the barrel here.
- **Design rationale:** The comment explains that centralising lifecycle, jurisdiction, and ownership here ensures "the export, the erasure and the doors all ask the same questions" — i.e., a single source of truth for task rules. See `docs/theory/domain-layer.md` for the broader theory.
