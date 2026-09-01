# src/modules/account/controllers/get-account.ts

## Purpose

Thin HTTP adapter for the `GET /account` endpoint. It validates the auth context, delegates the actual data fetch to `accountService.getOwnProfile`, and shapes the result into a standard success/reject response. It exists so the route layer stays declarative while the service layer stays transport-agnostic.

## Key elements

- **`getAccount`** (exported const) — Express handler `(request, response) => void`. Reads `request.authContext`; if absent, responds `401`. Otherwise calls `accountService.getOwnProfile(id, callerContextOf(request))` and returns `200` with the user object, `401` if the row is missing, or `500` on any thrown/rejected error.

## Relationships

- **`src/modules/account/routes.ts`** — Registers `getAccount` as the handler for the `GET /account` route.
- **`src/modules/account/services/index.ts`** — Supplies `accountService`, whose `getOwnProfile` method performs the actual database read.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` / `rejectResponse` helpers used for every outbound HTTP reply in this file.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)`, passed as the second argument to `getOwnProfile` so the service can apply caller-specific filters or metadata.

## Notes

- The full user row is fetched fresh rather than echoed from the JWT because the token only carries `id`, `email`, `username`, and `admin`; the client additionally needs `verified` and `locale`.
- A `401` is intentionally returned for **both** a missing auth context and a "user row deleted after token issuance" case — the comment labels this a *dead session*, not a server fault.
- The `.catch` branch swallows the error object and returns a bare `500`; no error details are forwarded to the client.
- Uses a promise chain (`.then().catch()`) rather than `async/await`; keep that style consistent if extending this file.
