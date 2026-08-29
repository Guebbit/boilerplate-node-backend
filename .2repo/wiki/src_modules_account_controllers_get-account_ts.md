# src/modules/account/controllers/get-account.ts

## Purpose

Controller for `GET /account`. Returns the authenticated user's full profile by querying the database, rather than echoing the JWT claims. This exists because the token only carries `id`/`email`/`username`/`admin`, while the API contract's `User` type also requires `verified` and `locale` fields that the frontend's verify-banner and saved-language features depend on.

## Key elements

- **`getAccount`** (exported) — Express handler. Resolves `authContext` from the request, calls `accountService.getOwnProfile`, and responds with the user or a 401/500.
- **`callerContextOf(request)`** — extracted from the request and forwarded into the service call so the service can apply caller-scoped logic.
- **`successResponse` / `rejectResponse`** — standardized envelope helpers used for all three exit paths (200, 401, 500).

## Relationships

- **`src/infrastructure/http/response.ts`** — provides `successResponse` and `rejectResponse`, the two response-shaping helpers used here.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf`, used to derive the caller context passed into the service.
- **`src/modules/account/services/index.ts`** — exports `accountService`; this controller calls `getOwnProfile(id, callerContext)`.
- **`src/modules/account/routes.ts`** — graph neighbor that wires this handler to the `GET /account` route.

## Notes

- A valid token whose DB row no longer exists is treated as a **401** (dead session), not a 500. The only 500 path is an unexpected thrown error in the service.
- The JSDoc explicitly warns against echoing `authContext` back as the profile: the schema's optional fields would let the mismatch pass silently, and the paired frontend only worked against its own mock until this was corrected.
- The handler is a plain function (not an arrow wrapped in `try/catch`); the `.catch` on the promise chain is the sole 500 guard.
