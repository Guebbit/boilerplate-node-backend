# src/modules/feedback/controllers/get-feedback.ts

## Purpose

Controller for the admin feedback-triage queue. Handles two transports for the same search — `GET /feedback` (cacheable query-string form) and `POST /feedback/search` (body form for filters too broad for a URL) — by reading a unified input, validating pagination, and delegating to the feedback service.

## Key elements

- **`FeedbackQuery`** — type alias: `Partial<Record<keyof SearchFeedbackRequestsRequest, string>>`, i.e. every filter as a raw query-string value.
- **`searchFeedbackKeyParameters`** (exported) — hand-listed array of query params that affect the endpoint's answer and therefore its cache key: `['page', 'pageSize', 'text', 'email', 'status']`. Not auto-derived; must stay in sync with what `getFeedback` destructures.
- **`getFeedback`** (exported) — the Express handler. Calls `readInput` to merge body/query filters, validates `page`/`pageSize` via `paginationSchema`, forwards the rest as free text to `feedbackRequestService.search`, and wraps the result in `successResponse`.

## Relationships

- **`@infrastructure/http/request`** — provides `readInput` (unified body/query extraction) and `callerContextOf` (caller identity passed to the service).
- **`@infrastructure/http/schemas`** — provides `paginationSchema`, the shared validation for `page`/`pageSize` so every endpoint 422s identically.
- **`@infrastructure/http/response`** — provides `successResponse` for the happy-path reply.
- **`@infrastructure/http/controller`** — provides `catchAs` (typed error-to-HTTP mapping) and `rejectValidation` (422 reply with schema error detail).
- **`src/modules/feedback/service.ts`** — `feedbackRequestService.search` is the downstream data access call; the controller passes parsed pagination plus raw filter strings and the caller context.
- **`src/modules/feedback/routes.ts`** — registers `getFeedback` on both `GET /feedback` and `POST /feedback/search`.
- **`src/types/index.ts`** — source of the `SearchFeedbackRequestsRequest` type that shapes the expected filter fields.

## Notes

- **Cache-key sync is manual.** `searchFeedbackKeyParameters` is not generated from the destructuring; adding a new filter to the controller without also adding it here will silently let two distinct searches share one cached response.
- **`status` is passed as a string.** `toFeedbackStatus()` (inside the service) maps it. An invalid value narrows the READ result set to nothing rather than returning 422 — deliberately different from the WRITE path, which does validate and reject.
- **Only pagination is validated.** All other filters (`text`, `email`, `status`) are forwarded as free text; there is no enum or regex check at this layer.
