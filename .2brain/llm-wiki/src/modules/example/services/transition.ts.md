---
source: src/modules/example/services/transition.ts
source_sha256: ff50732e1974d1be1114ee5532e8101054471e474496b01bd6a62fba06dbb6dd
context_sha256: e33ea3e610c644fb4543dbd355bbe0d9b2f6aaeb9c9ca70a3bebb5d550e6ab5f
generated_at: 2026-11-22T05:13:15.221277+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/services/transition.ts

## Purpose
Implements the lifecycle "doors" for an example: moving it between `draft`, `published` and `archived`, one exported function per event. Each door checks the move against the domain, performs a conditional write so that only one of two racing requests lands, and runs side effects (audit, outbox announcement, analytics) only for the winner.

## Key elements
- `publishById(id, context)`: applies the `publish` event.
- `archiveById(id, context)`: applies the `archive` event (draft or published to archived).
- `unarchiveById(id, context)`: applies the `unarchive` event (archived back to draft).
- `applyEvent` (private): shared flow.
  1. It loads the example with `findScoped`, filtered by `accessibleFilterFor(caller, 'Example', 'update')`. A miss returns 404.
  2. It checks `canApply(event, status)`. If the check fails, it returns 409.
  3. It computes the target status with `statusAfter` and calls `writeMove`. A `null` result returns 409.
  4. On success it records an audit entry and returns the example through `presentForCaller` with a 200.
- `writeMove` (private): builds the fields `{status, publishedAt}`. `publishedAt` is stamped only when `shouldStampPublishedAt` says so; otherwise the existing value is kept. For non-published targets it calls `exampleRepository.moveFrom(id, currentStatus, fields)`. For `published` it runs the same write inside `announceInTransaction`, which adds an `example.published` outbox event carrying `exampleId`, `userId` and `title`. After that, it emits analytics.
- `analysePublished` (private): emits the `EXAMPLE_PUBLISHED` analytics event with `example_id`.
- `notAllowed` / `REFUSALS`: build the 409 response. Each event has its own error code and i18n message key (`EXAMPLE_NOT_PUBLISHABLE`, `EXAMPLE_NOT_ARCHIVABLE`, `EXAMPLE_NOT_UNARCHIVABLE`). The status is passed in as the message parameter and as `details`.
- `TransitionResult`: `ResponseSuccess<Example> | ResponseReject`.

## Relationships
- `src/modules/example/domain/index.ts` and `src/modules/example/domain/lifecycle.ts`: supply `canApply`, `statusAfter`, `isPublished`, `shouldStampPublishedAt` and the `ExampleEvent` type. These decide what is allowed.
- `src/modules/example/repository.ts`: `findScoped` for the scoped read and `moveFrom` for the conditional write. `moveFrom` accepts an optional session.
- `src/kernel/access/query.ts`: `accessibleFilterFor` gives the visibility scope.
- `src/kernel/outbox.ts`: `announceInTransaction` ties the outbox row to the publish write.
- `src/modules/example/events.ts`: `EXAMPLE_PUBLISHED` event name.
- `src/modules/example/audit.ts` and `src/infrastructure/observability/audit.ts`: the example audit actions (the status-changed action) and `recordAudit`.
- `src/modules/example/analytics.ts` and `src/infrastructure/observability/analytics/index.ts`: `exampleAnalyticsEvents`, `emitAnalyticsEvent`, `buildAnalyticsBase`.
- `src/infrastructure/http/response.ts`: `generateSuccess` and `generateReject`.
- `src/infrastructure/i18n/index.ts`: `t` for messages.
- `src/modules/example/model.ts`: `ExampleDocument` type.
- `./owner`: `presentForCaller` shapes the response.
- `src/modules/example/services/index.ts` and `src/infrastructure/i18n/context.ts` are in the graph, but this file shows no direct interaction with them.

## Notes
- Visibility is checked before legality. A caller who cannot edit the example gets a 404, so they learn nothing about it.
- There is no `If-Match`. The write is conditional on the status that was read, so a racing loser gets the same 409 as an illegal move.
- Audit and analytics run only after a successful write. The audit entry records `{event, from, to}`.
- The module doc says to delete this file if the module has no lifecycle beyond create, edit and delete. It points to `orders` (`src/modules/orders/services/override.ts`) for a step-up-gated door.
