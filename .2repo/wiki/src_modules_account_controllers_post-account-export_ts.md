# src/modules/account/controllers/post-account-export.ts

## Purpose

Thin HTTP adapter that handles `POST /account/export`, delegating all logic to `accountService.exportOwnData`. It exists to bridge the Express request/response cycle to the account service, performing no business logic or authorization checks of its own — `requireFreshAuth` (mounted upstream in the route) is the sole identity gate.

## Key elements

- **`postAccountExport`** (exported) — The sole handler. Extracts the caller's `id` from the auth context, passes it along with `callerContextOf(request)` into `accountService.exportOwnData`, then routes the outcome through `refused` / `successResponse` / `catchAs`.

## Relationships

- **`src/modules/account/routes.ts`** — Registers `postAccountExport` on the `POST /account/export` path, attaching `requireFreshAuth` middleware ahead of the controller.
- **`src/modules/account/services/index.ts`** — Supplies `accountService.exportOwnData(id, ctx)`, the single domain call this controller makes.
- **`src/infrastructure/http/controller.ts`** — Provides the `refused` and `catchAs` helpers used to short-circuit on denial and serialize errors.
- **`src/infrastructure/http/request.ts`** — Provides `authContextOf` (extracts the authenticated user's `id`) and `callerContextOf` (passes downstream caller metadata into the service call).
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the 200 payload.

## Notes

- The controller assumes the auth context is **already populated** by middleware; there is no in-handler guard. Removing or bypassing `requireFreshAuth` in `routes.ts` would make `authContextOf(request).id` undefined and the call fail downstream.
- `callerContextOf(request)` is forwarded as the second argument to `exportOwnData`, giving the service access to any request-scoped caller metadata (e.g. IP, user-agent) without the controller having to enumerate fields.
