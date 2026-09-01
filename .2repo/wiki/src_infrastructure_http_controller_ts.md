# src/infrastructure/http/controller.ts

## Purpose

Shared HTTP helpers that extract the four steps every Express controller repeats—read input, validate, call a service, branch on the result, catch—into small composable functions. They deliberately avoid a `defineController()` wrapper so the `.catch()` call, the service result, and the handler itself remain visible to the `controller-chain-must-catch` AST linter.

## Key elements

- **`ServiceResult<TData>`** — Structural interface describing the envelope every service returns (`success`, `status`, optional `data` / `errors`). Not imported from a specific module to keep the layering clean.
- **`refused(response, result)`** — If the service result is a rejection, sends the error response and returns `true`; otherwise returns `false`. Only handles the failure half; the success path is intentionally left to each controller.
- **`catchAs(response, context)`** — Curried factory that returns a `.catch()` callback delegating to `rejectDatabaseError`. Keeps the literal `.catch(` at the call site for the AST rule.
- **`rejectValidation(response, error)`** — Sends a 422 with Zod-specific error items from a `ZodError`.
- **`parseBody(schema, body, response)`** — Runs `safeParse`; on success returns the typed data, on failure sends 422 and returns `undefined`. Callers must bail immediately on `undefined`.

## Relationships

- **`./response`** — Source of `rejectResponse`, `validationErrors`, and the `ResponseErrorItem` type; used by `refused`, `rejectValidation`, and `parseBody`.
- **`./errors`** — Source of `rejectDatabaseError`; consumed by `catchAs`.
- **`src/infrastructure/surfaces/create-*-controller.ts`** — Surface factories that import these helpers to wire concrete route handlers.
- **`src/modules/account/controllers/*.ts`** — Individual account-module controllers (login, logout, address CRUD, session management, password change, etc.) that each call `parseBody`, `refused`, and `catchAs` in their handler body.

## Notes

- `parseBody` both *responds* and *extracts*: if it returns `undefined`, the 422 is already sent and the handler must `return` without touching `response` again.
- The success path is intentionally **not** abstracted—controllers differ in payload shape, status code (200 vs 201), and side-effects (audit events), so only the refusal side is shared.
- `catchAs` is curried (`catchAs(res, "op-name")`) so the call site reads `.catch(catchAs(res, "deleteSession"))`, preserving the `.catch(` token the linter greps for.
