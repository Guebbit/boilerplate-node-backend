# src/modules/feedback/controllers/post-feedback-contact.ts

## Purpose

Controller handler for `POST /feedback/contact` (public endpoint). It validates the raw request body against a Zod schema and delegates to the feedback service to create a ticket and dispatch a support-notification email. The controller itself contains no business logic beyond validation and response shaping.

## Key elements

- **`createFeedbackSchema`** (module-level constant) – Extends the orval-generated `CreateFeedbackRequestBody` (kept in sync with `openapi.yaml`) to add runtime constraints not expressible in the OpenAPI schema: `.trim()` on all string fields, `max(120)` on `name` (optional), `z.email()` pipe on `email`, `min(1).max(200)` on `subject`, `min(1).max(5000)` on `message`.
- **`postFeedbackContact(request, response)`** (exported function) – Entry point called by the router. Uses `parseBody` to validate and early-returns on failure; on success calls `feedbackRequestService.create(body)` and responds with `201` via `successResponse`. All downstream errors are funnelled through `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Supplies `parseBody` (Zod-safe-parse + auto error response) and `catchAs` (centralised `.catch` logging/formatting) used inside the handler.
- **`src/infrastructure/http/response.ts`** – Supplies `successResponse`, the project-wide helper for JSON success replies.
- **`src/modules/feedback/routes.ts`** – Registers `postFeedbackContact` on the `POST /feedback/contact` route.
- **`src/modules/feedback/service.ts`** – Exposes `feedbackRequestService.create`, which performs the actual ticket creation and email send.
- **`src/types/index.ts`** – Provides the `CreateFeedbackRequest` interface used as the Express body type parameter on the handler signature.

## Notes

- The schema intentionally overrides the orval-generated base. When `openapi.yaml` changes, the generated base shifts but the `.extend(...)` overrides remain the source of truth for trimming and length limits.
- The comment in the file makes explicit that the email-notification responsibility is owned by the **service** (`feedbackRequestService.create`), not by this controller. Don't add send-mail logic here.
- `parseBody` returns `undefined` on validation failure *and* sends its own error response; the handler simply `return`s. There is no additional error handling needed in the `then` chain.
