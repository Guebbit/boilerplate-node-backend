# src/modules/account/controllers/post-2fa-setup.ts

## Purpose

Thin HTTP controller for `POST /account/2fa/setup`. It extracts the authenticated user's id, delegates to `accountService.setupTwoFactor`, and maps the service result (or error) onto an HTTP response. It contains no business logic of its own.

## Key elements

- **`post2faSetup(request, response)`** — Exported Express handler. Pulls `id` from the auth context, calls `accountService.setupTwoFactor(id)`, then either sends a `200` with `result.data` and the message *"Scan the QR code, then confirm a code."* or rejects with `result.status`/`result.errors`. Catches `CastError | Error` and routes it through `rejectDatabaseError`.

## Relationships

- **`src/modules/account/services/index.ts`** — Calls `accountService.setupTwoFactor(id)`; all enrollment logic lives there.
- **`src/infrastructure/http/request.ts`** — Uses `authContextOf(request)` to obtain the authenticated user's `id`.
- **`src/infrastructure/http/response.ts`** — Uses `successResponse` / `rejectResponse` for the two happy/sad-path branches.
- **`src/infrastructure/http/errors.ts`** — Uses `rejectDatabaseError` in the `.catch` block (handles Mongoose `CastError` and generic errors).
- **`src/modules/account/routes.ts`** — Registers this handler on the `POST /account/2fa/setup` route (route guard applies fresh critical auth before the handler runs).

## Notes

- Auth is enforced by the **route guard**, not inside this controller. The comment explicitly calls out that "starting enrollment is itself a sensitive action," so the guard requires a fresh critical-auth token.
- Uses promise chaining (`.then` / `.catch`) rather than `async`/`await`, consistent with the surrounding controller style.
- The error parameter is typed `CastError | Error` (Mongoose-specific) — the generic `rejectDatabaseError` helper is expected to normalise both.
