---
source: src/modules/tasks/domain/index.ts
source_sha256: b008262c5b6a3dd8f1c111309676ff8d3c88419b236b5bd9f6dcb04a41748d71
context_sha256: 5632c7d2044f1ced747de0cb320a5c7ab690fc09303172285d0ad6720f0e3370
generated_at: 2026-11-22T07:59:22.258398+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/domain/index.ts

## Purpose
Barrel file for the tasks domain layer. It re-exports the pure rules (lifecycle, actions, ownership, routing, system openings) from their sibling files as one public surface. The module doc states that the layer is lint-guaranteed free of Express, Mongoose and every tier. The lifecycle, route sets and ownership rule live here rather than inline in the service, so the export, the erasure and the doors all ask the same questions.

## Key elements
- **Lifecycle** (from `./lifecycle`):
  - `initialTaskStatus`, `isOpen`, `OPEN_STATUSES`, `openKeyOf`, `DUE_SOON_MS`
  - Transitions: `resolve`, `reopen`, `markSpam`, `clear`
  - Types: `TaskFacts`, `TaskPatch`, `TaskRefusal`, `Transition`
- **Actions** (from `./actions`): `actionsOf`, plus types `ActionFacts` and `TaskActionFlags`.
- **Ownership** (from `./ownership`): `ownTasksFilter`, plus types `OwnerRef` and `OwnTasksFilter`.
- **Routing** (from `./routing`): `CONTACT_ROUTE_SET`.
- **System** (from `./system`): `accountReviewOpening`, `exportFailedOpening`, and the `SystemOpening` type.

## Relationships
- Pure re-export of `src/modules/tasks/domain/lifecycle.ts`, `actions.ts`, `ownership.ts`, `routing.ts` and `system.ts` (all in the same folder). It contains no logic of its own.
- The module doc names the export, the erasure and the doors as the consumers of these shared rules. This most plausibly refers to the services (`src/modules/tasks/services/read.ts`, `src/modules/tasks/services/personal-data.ts`, `src/modules/tasks/services/contact.ts`, `src/modules/tasks/services/system.ts`, `src/modules/tasks/services/workflow.ts`) and `src/modules/tasks/presenter.ts`. The file itself does not import them, so the exact consumers are not visible here.
- `src/modules/tasks/index.ts`, `src/modules/tasks/model.ts` and `src/modules/tasks/repository.ts` sit next to this file in the graph, but this file shows no direct interaction with them.
- `src/modules/tasks/tests/integration/system-sources.test.ts` is a neighbor in the graph. The file shows no direct link to it.

## Notes
- Anything not exported here is not part of the domain's public surface. Consumers should import from this barrel, not from the individual files.
- The layer is meant to stay pure: there are no framework, persistence or tier imports, and lint enforces this.
