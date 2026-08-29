# src/modules/delivery/controllers/post-courier-advance.ts

## Purpose
Express handler for `POST /delivery/advance`. It triggers a single "courier tick" that causes every parcel currently on a truck to arrive. Because the repository deliberately ships no scheduler, this admin-facing endpoint (or the demo's admin button) serves as the manual cron.

## Key elements
- **`postCourierAdvance(request, response)`** — Exported Express handler. Extracts caller context via `callerContextOf(request)`, delegates to `deliveryService.runCourierAdvance(...)`, replies with `{ advanced }` through `successResponse`, and routes rejections through `catchAs(response, 'postCourierAdvance')`.

## Relationships
- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, the shared error-catch wrapper used here.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, which reads the authenticated caller context off the Express `Request`.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the standard JSON success envelope.
- **`src/modules/delivery/service.ts`** — Supplies `deliveryService`; the handler calls its `runCourierAdvance` method for all business logic.
- **`src/modules/delivery/routes.ts`** — Registers `postCourierAdvance` on the `POST /delivery/advance` route.

## Notes
- The JSDoc block in the file explicitly documents the "no scheduler" design decision; the endpoint is the only way to advance parcels in production-like flows.
- The handler is a thin delegation layer—no business logic lives here. All state changes are in `deliveryService.runCourierAdvance`.
