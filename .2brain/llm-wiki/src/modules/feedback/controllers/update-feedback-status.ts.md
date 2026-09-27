---
source: src/modules/feedback/controllers/update-feedback-status.ts
sha256: 09675aa9d710a0ed47897ed941b295ecf60b1ed23ad8fdcbc1f31101feaa901e
generated_at: 2026-09-27T14:52:38.162066+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/controllers/update-feedback-status.ts

## Purpose

Defines the handler pair for `PUT /feedback/:id` (full replace) and `PATCH /feedback/:id` (partial merge) — the admin-triage endpoints for changing a feedback ticket's status and notes. Both handlers are generated from the shared `createUpdateController` factory and delegate to `feedbackRequestService.updateStatusById`, which performs the audit and persistence.

## Key elements

- **`adminNotesWithCap`** — A local Zod schema (`z.string().min(1).max(5000).nullish()`) that layers a 5 000-char cap onto `adminNotes`. It is deliberately re-stated in full (rather than just adding `.max`) so that `.min(1)` and `.nullish()` survive the `.extend()` call and `null` still clears notes on both verbs.
- **`replaceFeedbackStatus`** — The `PUT` handler. Validates the body against `ReplaceFeedbackRequestStatusBody` (extended with the capped `adminNotes`) and calls `updateStatusById` with the full set of changes.
- **`updateFeedbackStatus`** — The `PATCH` handler. Same flow but against the partial `UpdateFeedbackRequestStatusBody`.
- **`present` callback** — Invokes the Mongoose document's `.toJSON()` (which renames `_id` → `id` and serializes dates to ISO strings) and casts the result to `FeedbackRequest`.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** — The factory that produces the destructured `{ replace, update }` handler pair from a single config object (entity name, schemas, `update` fn, `present` fn).
- **`src/modules/feedback/service.ts`** — Supplies `feedbackRequestService.updateStatusById`, the sole business-logic call; it owns the audit log.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)`, extracting authenticated caller metadata that is forwarded to the service for auditing.
- **`src/modules/feedback/routes.ts`** — Registers `replaceFeedbackStatus` / `updateFeedbackStatus` on the `PUT` / `PATCH /feedback/:id` routes.
- **`src/types/index.ts`** — Source of the `FeedbackRequest` type used in the `present` cast.

## Notes

- **Schema extension pitfall:** Zod's `.extend()` *replaces* the target key's schema rather than deep-merging it. That is why `adminNotesWithCap` re-declares `.min(1).nullish()` — omitting those would silently break `null`-clears-notes and the minimum-length rule.
- **Mongoose typing:** `.toJSON()` is typed as `any` by Mongoose's d.ts; the `as FeedbackRequest` cast is safe only because `toJSON` is the documented way to get the plain-object representation. Do not replace it with a spread or `Pick`.
- **Single service call:** Both verbs funnel through the same `updateStatusById`; the replace-vs-patch distinction is purely at the validation layer (which fields are present in the body), not in the service.
