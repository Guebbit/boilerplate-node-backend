# src/infrastructure/http/controller.ts

## Purpose

Shared helper functions that eliminate the four repeated steps in every HTTP controller (validation, refusal branching, error catching, and body parsing). Deliberately exported as individual helpers rather than a `defineController()` wrapper, so that stack traces stay pointed at the handler, generic type inference is preserved, and the `controller-chain-must-catch` ESLint rule can still see the literal `.catch()` at each call site.

## Key elements

- **`ServiceResult<TData>`** (internal interface) — structural shape every service returns (`success`, `status`, `message?`, `data?`, `errors?`). Defined locally because `@infrastructure` must not import from a module.
- **`refused(response, result)`** — sends the rejection response if `result.success` is false and returns `true`; returns `false` on success. Controllers use it as a one-line bail-out before the success path.
- **`catchAs(response, context)`** — returns a callback suitable for `.catch()`. Logs the operation name (`context`) and delegates to `rejectDatabaseError`.
- **`rejectValidation(response, error)`** — sends a 422 with Zod error details via `rejectResponse` + `validationErrors`.
- **`parseBody(schema, body, response)`** — runs `safeParse` against a generated Zod schema. On success returns the typed `TSchema['_output']`; on failure sends 422 and returns `undefined`. Caller must bail out on `undefined` without touching the response again.

## Relationships

- **`src/infrastructure/http/response.ts`** — provides `rejectResponse`, `validationErrors`, and the `ResponseErrorItem` type used by `refused`, `rejectValidation`, and `parseBody`.
- **`src/infrastructure/http/errors.ts`** — provides `rejectDatabaseError`, the only dependency of `catchAs`.
- **Account module controllers** (`post-login.ts`, `get-sessions.ts`, `delete-session.ts`, etc.) — the primary consumers; each imports these four helpers to replace inline validation, refusal branching, and catch logic.
- **`src/infrastructure/http/delete-controller.ts`** — peer in the same directory; follows the same controller pattern and is expected to consume these helpers.

## Notes

- `parseBody` and `extractAndValidateId` (in `./request`) share a contract: they **respond** as well as extract. The caller must check for `undefined` and return immediately; a second `res.*` call after that is a bug.
- `refused` intentionally does **not** handle the success path — controllers still own how and what they send on success (201 vs 200, transformed payload, audit event ordering, etc.).
- `catchAs` returns a **callback**, not a thrown value. The literal `.catch(catchAs(res, 'opName'))` syntax is what the ESLint rule `controller-chain-must-catch.ts` expects to find in the AST.
- `ServiceResult` is structural on purpose: it mirrors `generateSuccess` / `generateReject` output without importing those helpers, keeping the dependency direction module → infrastructure.
