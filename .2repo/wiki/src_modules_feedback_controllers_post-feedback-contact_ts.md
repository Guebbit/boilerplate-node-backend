# src/modules/feedback/controllers/post-feedback-contact.ts

## Purpose

Handler for `POST /feedback/contact`, the module's sole public write endpoint. It validates the incoming body with a Zod schema, delegates ticket creation and support-notification to the feedback service, and returns a `201` with the created record. It is mounted above (not exempted from) the admin gate in `../routes`.

## Key elements

- **`createFeedbackSchema`** (module-local, not exported) — Extends the orval-generated `CreateFeedbackRequestBody` (`@api/schemas.zod`) to add `.trim()`, min/max length constraints, and an explicit `z.email()` pipe on `email`. The `name` field is optional; `subject` and `message` are required.
- **`postFeedbackContact`** (exported) — Express handler typed against `CreateFeedbackRequest`. Calls `parseBody` → `feedbackRequestService.create(body)` → `successResponse(response, …, 201)`. Errors are funnelled through `catchAs(response, 'postFeedbackContact')`.

## Relationships

- **`src/modules/feedback/routes.ts`** — Imports and mounts this handler on `POST /feedback/contact` *above* the admin-auth middleware so it remains publicly accessible.
- **`src/modules/feedback/service.ts`** — `feedbackRequestService.create` performs the actual persistence and sends the support notification email. The controller does not own notification logic.
- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody` (Zod validation + early-return on failure) and `catchAs` (uniform error serialization).
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the standard success envelope.
- **`src/types/index.ts`** — Provides the `CreateFeedbackRequest` type used in the handler's generic signature.

## Notes

- The schema is deliberately layered on top of the OpenAPI-derived base so that runtime constraints (trimming, max lengths) live in one place without diverging from the contract in `openapi.yaml`. Keep both in sync when changing fields.
- Email-notification language and recipient are decided inside `feedbackRequestService.create`, not here — do not add notification logic to the controller.
- The handler is synchronous-looking but returns a Promise (via `.then`/`.catch`); it does not use `async/await`.
