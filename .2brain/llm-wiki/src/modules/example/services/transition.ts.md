---
source: src/modules/example/services/transition.ts
sha256: 40b7d77805a69151e21b5f9db4ccdd595ac3af2766051a4f263c755f04227262
generated_at: 2026-10-29T03:56:41.375282+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/transition.ts

## Purpose

Service layer for the example lifecycle: it exposes one function per state transition (`publishById`, `archiveById`, `unarchiveById`) that validates the move against domain rules, performs a conditional (status-guarded) write so that concurrent racers resolve to exactly one winner, and fires the winner's side effects (outbox event, analytics, audit). It exists to keep transition logic out of the HTTP handler and out of the domain model.

## Key elements

- **`publishById` / `archiveById` / `unarchiveById`** — public exports; thin wrappers that call `applyEvent` with the corresponding `ExampleEvent`.
- **`applyEvent`** (internal) — orchestrates: scoped find → domain legality check → conditional write → audit → shape response. Returns `TransitionResult`.
- **`writeMove`** (internal) — performs the conditional status write via `exampleRepository.moveFrom`. For a move into `published`, wraps the write and the outbox announcement in a single transaction via `announceInTransaction`. Stamps `publishedAt` only when `shouldStampPublishedAt` says to. Returns `null` if a peer changed the status first.
- **`notAllowed`** (internal) — builds the 409 `ResponseReject` with the event-specific error code and i18n message.
- **`analysePublished`** (internal) — emits the `EXAMPLE_PUBLISHED` analytics event after a successful publish write.
- **`REFUSALS`** — const map from each `ExampleEvent` to its 409 error code and i18n key.
- **`TransitionResult`** — type alias: `ResponseSuccess<Example> | ResponseReject`.

## Relationships

- **`@infrastructure/http/response`** — imports `generateReject` and `generateSuccess` to shape every response (404, 409, 200).
- **`@infrastructure/i18n`** — calls `t()` to resolve user-facing error and not-found messages.
- **`@infrastructure/observability/analytics`** — calls `emitAnalyticsEvent` and `buildAnalyticsBase` inside `analysePublished`.
- **`@infrastructure/observability/audit`** — calls `recordAudit` after every successful transition to log the status change.
- **`@kernel/access/query`** — calls `accessibleFilterFor` to scope the initial `findScoped` read to the caller's `update` permission.
- **`@kernel/outbox`** — calls `announceInTransaction` so the `EXAMPLE_PUBLISHED` outbox row is committed atomically with the status write.
- **`../domain` (index / lifecycle)** — imports `canApply`, `isPublished`, `shouldStampPublishedAt`, `statusAfter` for all transition-rule decisions.
- **`../events`** — imports `EXAMPLE_PUBLISHED` as the outbox event name.
- **`../analytics`** — imports `exampleAnalyticsEvents` for the analytics event identifier.
- **`../audit`** — imports `exampleAuditActions` for the audit-log action identifier.
- **`../model`** — imports the `ExampleDocument` type used as the repository's read/write shape.
- **`../repository`** — imports `exampleRepository` for `findScoped` and `moveFrom` (the conditional write).

## Notes

- **No ETag / `If-Match`.** Concurrency safety comes from the conditional write: `moveFrom` includes the read status in the filter, so a second racer gets `null` and receives 409.
- **Visibility before legality.** The scoped find returns 404 before the domain check runs, so an unauthorised caller cannot probe whether a given id exists or what status it holds.
- **`publishedAt` is write-once.** `shouldStampPublishedAt` guards it; re-publishing after an archive + unarchive cycle does not overwrite the original timestamp.
- **Publish side-effects are ordered.** Outbox write is in-transaction; analytics emission is post-commit (after `writeMove` resolves). Audit is also post-write.
- **Delete criterion (per module docstring).** If a module has no lifecycle beyond create/edit/delete, this file has no reason to exist. See `orders/services/override.ts` for a step-up-gated variant.
