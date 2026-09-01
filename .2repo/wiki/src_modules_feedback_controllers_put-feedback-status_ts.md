# src/modules/feedback/controllers/put-feedback-status.ts

## Purpose

Admin-facing handler for `PUT /feedback/:id` that validates the request body, delegates the status/notes update to the feedback service, and shapes the HTTP response. Exists to keep route-level parsing, authorization context extraction, and error handling in one thin layer separate from business logic.

## Key elements

- **`updateFeedbackStatusSchema`** — Extends the orval-generated `UpdateFeedbackRequestStatusBody` (from `@api/schemas.zod`) with a `z.string().max(5000).optional()` cap on `adminNotes`, a constraint not present in the OpenAPI spec.
- **`putFeedbackStatus`** (exported) — The Express handler. Parses the body against the schema, calls `feedbackRequestService.updateStatusById` with the ticket ID, validated body, and caller context, then dispatches `successResponse` or a `refused`/error response.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Source of the `parseBody`, `refused`, and `catchAs` utilities that structure validation, rejection, and error handling.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)`, used to pass authenticated/authorized caller metadata into the service call.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the 2xx reply path.
- **`src/modules/feedback/service.ts`** — `feedbackRequestService.updateStatusById` performs the actual database/logic work.
- **`src/modules/feedback/routes.ts`** — Registers `putFeedbackStatus` as the handler for the `PUT /feedback/:id` route.
- **`src/types/index.ts`** — Supplies the `UpdateFeedbackRequestStatusRequest` type used in the handler's signature.

## Notes

- The `adminNotes` 5 000-character cap is a deliberate *superset* over the OpenAPI schema; if the spec changes, re-run orval and keep the `.extend()` in sync.
- The `DISPOSITION` comment flags an asymmetry: on write, an out-of-set status is rejected with 422 via the generated enum; on read, the corresponding narrowing (`toFeedbackStatus`) resolves to `never`. Keep both sides aligned when the status set changes.
- Follows the standard `parseBody → service → refused/successResponse → catchAs` pattern shared by other controllers in this project.
