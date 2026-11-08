---
source: src/modules/example/services/transition.ts
sha256: 40b7d77805a69151e21b5f9db4ccdd595ac3af2766051a4f263c755f04227262
generated_at: 2026-11-08T05:54:24.339233+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/transition.ts

## Purpose
Implements the lifecycle "door" for the Example entity — the single point where a draft, published, or archived example can change status. Each transition is a standalone service function (not a field on the update payload) that checks domain legality, performs a conditional write (so only one racer lands), and fires side effects (outbox announcement, analytics, audit) only for the winner.

## Key elements

- **`publishById(id, context)`** — Exports. Moves a draft to `published`. Triggers the outbox announcement (`EXAMPLE_PUBLISHED`) and an analytics event in the same transaction as the write.
- **`archiveById(id, context)`** — Exports. Moves a draft or published example to `archived`.
- **`unarchiveById(id, context)`** — Exports. Moves an archived example back to `draft`.
- **`applyEvent(event, id, context)`** (internal) — Shared pipeline for all three: loads via `findScoped` with an access filter, checks domain legality via `canApply`, calls `writeMove`, then records audit and shapes the response.
- **`writeMove(example, to, context)`** (internal) — Performs the conditional `moveFrom` write. When moving to `published`, wraps the write and outbox row in `announceInTransaction`; otherwise a plain conditional write. Stamps `publishedAt` only on the first transition into published (delegated to `shouldStampPublishedAt`).
- **`notAllowed(event, status)`** (internal) — Builds the uniform 409 response using per-event error codes and i18n message keys from the `REFUSALS` table.
- **`analysePublished(example, context)`** (internal) — Emits the `EXAMPLE_PUBLISHED` analytics event after a successful publish write.
- **`REFUSALS`** — Static map of `ExampleEvent → { code, message }` used to produce localized 409 bodies.
- **`TransitionResult`** — Union type `ResponseSuccess<Example> | ResponseReject` returned by every door function.

## Relationships

- **`src/modules/example/domain/index.ts`** — Imports `canApply`, `isPublished`, `shouldStampPublishedAt`, `statusAfter`, and the `ExampleEvent` type. The domain decides *whether* a move is legal; this file decides *how* to execute it.
- **`src/modules/example/repository.ts`** — Calls `exampleRepository.findScoped` (read with access scope) and `exampleRepository.moveFrom` (conditional write).
- **`src/kernel/outbox.ts`** — Calls `announceInTransaction` so the `EXAMPLE_PUBLISHED` outbox row and the status write commit atomically.
- **`src/modules/example/events.ts`** — Imports `EXAMPLE_PUBLISHED` as the outbox event name.
- **`src/modules/example/analytics.ts`** — Imports `exampleAnalyticsEvents` for the analytics event name.
- **`src/modules/example/audit.ts`** — Imports `exampleAuditActions` for the audit action constant.
- **`src/modules/example/model.ts`** — Imports `ExampleDocument` as the repository document type.
- **`src/infrastructure/http/response.ts`** — Uses `generateSuccess` / `generateReject` for API response shaping.
- **`src/infrastructure/i18n/index.ts`** — Uses `t()` for localized error messages.
- **`src/infrastructure/observability/audit.ts`** — Calls `recordAudit` after every successful transition.
- **`src/infrastructure/observability/analytics/index.ts`** — Calls `emitAnalyticsEvent` and `buildAnalyticsBase` on publish.
- **`src/kernel/access/query.ts`** — Calls `accessibleFilterFor` to scope the read to what the caller may update (produces the 404-for-strangers behavior).
- **`src/modules/example/services/index.ts`** — Re-exports or aggregates this module alongside sibling services (e.g. `owner.ts`, referenced via `presentForCaller`).

## Notes

- **No `If-Match` / ETag.** Concurrency safety comes from the conditional write (`moveFrom` keyed on the *read* status), not an optimistic token. Two racers both pass `canApply`, but only one's `moveFrom` matches; the other gets `null` → 409.
- **Visibility before legality.** The access-scoped read (`accessibleFilterFor`) runs *before* the domain check. A caller without `update` gets a 404, never a 409, so existence is not leaked.
- **`publishedAt` is stamped exactly once.** `shouldStampPublishedAt` guards against overwriting the original timestamp on re-publish (e.g. archive → unarchive → publish).
- **Analytics are fire-and-forget side effects**, *not* part of the outbox transaction. They run after the write succeeds but are not rolled back if a later step fails (there is no later step, but the distinction matters for reasoning about consistency).
- **Delete criterion (from module doc):** if a module's lifecycle is only create/edit/delete, this file should not exist. See `orders/services/override.ts` for a step-up-gated variant.
