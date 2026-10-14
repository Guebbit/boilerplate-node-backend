---
source: src/modules/feedback/controllers/post-feedback-contact.ts
sha256: 382a945bfdc1fef7e5e809d5bd8d6f3bbb6e1eb7fbe8fa34ec0f6fa47b068367
generated_at: 2026-10-14T15:48:57.483628+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/controllers/post-feedback-contact.ts

## Purpose

Controller for `POST /feedback/contact`, the single public write endpoint in the feedback module. It validates and trims the incoming body, delegates ticket creation (and the resulting support email) to the service layer, and returns a `201` with the created resource.

## Key elements

- **`createFeedbackSchema`** — A Zod schema built by extending the generated `CreateFeedbackRequestBody` with `trimmedInto` on `name`, `email`, `subject`, and `message`. Trimming ensures whitespace-only values are treated as empty. No bounds are restated locally; all limits come from the generated shape.
- **`postFeedbackContact(request, response)`** — The exported Express handler. Calls `parseBody` with `createFeedbackSchema`; on failure returns early. On success, calls `feedbackRequestService.create(body)`, maps the result through `presentFeedbackRequest`, and sends a `createdResponse` (201) with a `Location` header of `/feedback/:id`. Errors are funneled to `catchAs`.

## Relationships

- **`../routes.ts`** — Mounts this controller above the admin gate (not exempted from it).
- **`../service.ts`** — `feedbackRequestService.create` performs the actual persistence *and* sends the support-notification email; the controller does not handle notification logic.
- **`../presenter.ts`** — `presentFeedbackRequest` shapes the domain entity into the API response contract.
- **`@infrastructure/http/controller.ts`** — Supplies `parseBody` (schema validation + early-exit) and `catchAs` (uniform error mapping).
- **`@infrastructure/http/response.ts`** — Supplies `createdResponse` for the 201 + `Location` reply.
- **`@infrastructure/http/schemas.ts`** — Supplies `trimmedInto`, the per-field transform used to build `createFeedbackSchema`.
- **`@types/index.ts`** — Source of the `CreateFeedbackRequest` and `FeedbackRequest` type aliases used in the handler signature and response generic.

## Notes

- The `.then()/.catch()` chain is deliberate: the notification is explicitly the service's concern, not the controller's. The comment in-file reinforces that "who gets told, and in which language" belongs to the ticket, not the request.
- `parseBody` returns `undefined` on failure and the handler returns immediately—there is no `throw` or `next(err)` path from validation.
- Because the schema is *extended* from the generated type, regenerating `CreateFeedbackRequestBody` automatically propagates new/removed fields; only the `trimmedInto` wrappers are hand-maintained.
