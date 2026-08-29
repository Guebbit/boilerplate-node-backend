# src/modules/feedback/controllers/get-feedback.ts

## Purpose

Single controller for searching and paginating feedback tickets. Serves both the cacheable query form (`GET /feedback`) and the admin body form (`POST /feedback/search`) through one function, delegating all data access to the feedback service.

## Key elements

- **`searchFeedbackKeyParameters`** (exported const) — hand-listed array `['page', 'pageSize', 'text', 'email', 'status']` used to build the cache key for the GET route. Must stay in sync with the parameters destructured in `getFeedback`.
- **`getFeedback`** (exported function) — the controller. Reads filters from query or body via `readInput`, validates pagination with `paginationSchema`, passes `status` as a raw string to the service, and returns the result via `successResponse` / `rejectValidation` / `catchAs`.

## Relationships

- **`src/modules/feedback/routes.ts`** — registers `getFeedback` on both `GET /feedback` and `POST /feedback/search`.
- **`src/modules/feedback/service.ts`** — provides `feedbackRequestService.search`, the sole data-access call in this controller.
- **`src/infrastructure/http/request.ts`** — supplies `readInput` (unified query/body reading) and `callerContextOf` (auth context forwarded to the service).
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` for shaping the HTTP reply.
- **`src/infrastructure/http/schemas.ts`** — supplies `paginationSchema`, the only validation applied in this controller.
- **`src/infrastructure/http/controller.ts`** — supplies `catchAs` (error→status mapping) and `rejectValidation` (422 helper).
- **`src/types/index.ts`** — provides the `SearchFeedbackRequestsRequest` type used in the `Request` generic.

## Notes

- **Cache-key coupling:** `searchFeedbackKeyParameters` is deliberately *not* derived from the function's destructuring. If a new parameter is added to `getFeedback` but forgotten here, two different searches will share one cached response for the cache's entire TTL.
- **Body form is uncached by design:** filters arriving in a request body cannot appear in the URL and therefore cannot be part of the cache key; that is why the body variant lives on a separate, unkeyed route.
- **Only pagination is validated.** `text`, `email`, and `status` are free-text and passed through unvalidated. An unrecognised `status` value does **not** produce a 422 on this read path — the service's `toFeedbackStatus()` helper narrows the result set to empty instead.
- **`status` is passed as `string | undefined`**, never as an enum. The string→enum mapping is the service's responsibility.
