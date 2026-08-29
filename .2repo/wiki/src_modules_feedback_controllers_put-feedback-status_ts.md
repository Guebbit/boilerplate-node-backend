# src/modules/feedback/controllers/put-feedback-status.ts

## Purpose

Handles the `PUT /feedback/:id` admin endpoint. It validates the incoming body (status + optional admin notes), delegates to the feedback service to update a ticket, and maps the service result onto an HTTP response.

## Key elements

- **`updateFeedbackStatusSchema`** – Zod schema built by extending the orval-generated `UpdateFeedbackRequestStatusBody` with an `adminNotes: z.string().max(5000).optional()` field. The length cap is an application-level constraint not expressed in `openapi.yaml`.
- **`putFeedbackStatus`** *(exported)* – Express handler for `PUT /feedback/:id`. Parses/validates the body, calls `feedbackRequestService.updateStatusById(id, body, callerContext)`, then responds via `successResponse` or `refused`. Errors are funneled through `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Supplies `parseBody`, `refused`, and `catchAs`, the shared validation/response/error helpers used throughout the controller.
- **`src/infrastructure/http/request.ts`** – Provides `callerContextOf`, which extracts the authenticated caller identity for the service call.
- **`src/infrastructure/http/response.ts`** – Provides `successResponse` for the happy-path reply.
- **`src/types/index.ts`** – Contributes the `UpdateFeedbackRequestStatusRequest` type used as the generic body type on the Express `Request`.
- **`src/modules/feedback/service.ts`** – Exposes `feedbackRequestService.updateStatusById`, the actual persistence/update logic this controller delegates to.
- **`src/modules/feedback/routes.ts`** – Wires `putFeedbackStatus` as the handler for the `PUT /feedback/:id` route.

## Notes

- The `DISPOSITION` comment in the source documents a project-wide convention: an out-of-set enum value is **rejected with 422 on the write path** (this controller), whereas on the **read path** the same value narrows to nothing (see `toFeedbackStatus` elsewhere). The two halves are intentionally asymmetric.
- The schema intentionally diverges from the OpenAPI spec by adding the `adminNotes` length cap. If you regenerate from `openapi.yaml`, that cap will be lost and must be re-applied here.
- The `refused` helper is checked *before* `successResponse`; a service result can be a refusal even though no exception was thrown.
