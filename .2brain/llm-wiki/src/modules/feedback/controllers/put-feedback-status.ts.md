---
source: src/modules/feedback/controllers/put-feedback-status.ts
sha256: ad21e3fe85fa5a2459c32f05572752101d4fce82867348acfa208c99283b002d
generated_at: 2026-09-23T18:39:38.280941+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/controllers/put-feedback-status.ts

## Purpose

Controller handler for `PUT /feedback/:id` (admin). Validates the request body, delegates the status/notes update to the feedback service, and serialises the result into an HTTP response. It exists to keep HTTP concerns (parsing, error mapping, response shaping) separate from the domain logic in the service layer.

## Key elements

- **`updateFeedbackStatusSchema`** (const) — Extends the orval-generated `UpdateFeedbackRequestStatusBody` (from `@api/schemas.zod`) with an `adminNotes` field capped at 5 000 characters, a constraint not expressible in the OpenAPI schema.
- **`putFeedbackStatus`** (exported const, handler) — The Express route handler. Parses the body via `parseBody`, calls `feedbackRequestService.updateStatusById` with the caller context, maps a `refused` result to the appropriate HTTP error, and on success returns `result.data.toJSON()` wrapped in `successResponse`. Catches any thrown error with `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies the `parseBody`, `refused`, and `catchAs` helpers used for request validation, disposition mapping, and error handling.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)`, which extracts authenticated-caller metadata passed into the service call.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for shaping the 200 reply.
- **`src/modules/feedback/service.ts`** — Source of `feedbackRequestService`; this controller calls its `updateStatusById` method.
- **`src/modules/feedback/routes.ts`** — Wires this handler onto the `PUT /feedback/:id` route.
- **`src/types/index.ts`** — Defines the `FeedbackRequest` and `UpdateFeedbackRequestStatusRequest` types used for response typing and the Express generic signature.

## Notes

- The `DISPOSITION` comment in the handler references a paired READ path (`toFeedbackStatus`) that narrows an unknown status to `never` instead of rejecting with 422. The two halves are intentionally asymmetric: writes fail fast at the schema boundary, reads collapse to the empty type for compile-time safety.
- `.toJSON()` on the service result is load-bearing — it applies the Mongoose-style `_id → id` and date-to-ISO-string transforms before the object is cast to `FeedbackRequest`. Omitting it would leak internal field names into the API response.
- `adminNotes` max-length (5 000) lives only in this Zod schema; it is **not** in `openapi.yaml`, so OpenAPI consumers won't see the cap. Keep in mind if you regenerate from spec.
