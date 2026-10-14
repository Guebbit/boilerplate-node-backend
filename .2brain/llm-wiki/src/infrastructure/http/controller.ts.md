---
source: src/infrastructure/http/controller.ts
sha256: 0645830350f09668c47acc9e53f592d5d0945abfb48fe81b8f7339c4a7a77632
generated_at: 2026-10-14T07:53:05.385815+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/controller.ts

## Purpose

Shared helper functions that encode the four-step pattern every Express controller repeats (parse input, validate, call a service method, branch on the result, catch). They are intentionally written as standalone helpers rather than a `defineController()` wrapper so that stack traces point at the actual handler, the service result's type stays concrete, and the literal `.catch(` call remains visible to the `controller-chain-must-catch` AST lint rule.

## Key elements

- **`operationName(verb, entity, suffix?)`** — Builds a canonical operation name (e.g. `getAccountItem`) from a verb, entity, and optional disambiguating suffix. Single source of truth for the name used in stack traces, log lines, and generated `docs/modules/` tables.
- **`namedHandler(operation, handler)`** — Assigns a specific `name` to an otherwise anonymous Express handler by exploiting the computed-property-key trick (a function literal written at that key inherits the key's name). Preserves the caller's generic signature via a final `as THandler` cast.
- **`ServiceResult<TData>`** (type) — Convenience alias for `ResponseSuccess<TData> | ResponseReject`, the exact union a service method returns.
- **`refused(response, result)`** — Type-predicate guard: if the service result is a rejection, sends the error response and returns `true`; otherwise returns `false` and narrows `result` to `ResponseSuccess<TData>`. Only handles the failure half; the success half stays in each controller.
- **`catchAs(response, context)`** — Returns a callback for `.catch(...)` that delegates to `rejectDatabaseError`. The `.catch(` token stays at the call site so the lint rule still sees it.
- **`rejectValidation(response, error)`** — Sends a 422 with structured `validationErrors` from a `ZodError`.
- **`parseBody(schema, body, response)`** — Runs `schema.safeParse`, additionally checks for malformed ID fields via `malformedIdIssues`, and on any failure sends a single 422 with all issues combined. Returns the parsed body on success or `undefined` (caller must bail out without touching the response again).

## Relationships

- **`./response`** — Imports `rejectResponse`, `validationErrors`, and the `ResponseSuccess` / `ResponseReject` types. This file re-exports the union as `ServiceResult` and delegates all actual response-writing to `rejectResponse`.
- **`./errors`** — Imports `rejectDatabaseError`, used inside `catchAs`.
- **`./ids`** — Imports `malformedIdIssues`, used inside `parseBody` to reject non-conformant ID values before they reach the database.
- **`src/infrastructure/surfaces/create-*-controller.ts`** (item, list, delete, update, search, restore) — Controller factories that call `operationName` to derive handler names and use `parseBody`, `refused`, and `catchAs` to build their Express routes.
- **`src/modules/account/controllers/*`** (cancel-pending-email, delete-2fa-method, delete-2fa, delete-account-confirm, delete-account-request) — Concrete account controllers that consume the same helpers for their request-validation and error-handling steps.

## Notes

- `parseBody` **responds** (sends the 422) as a side effect; it is not a pure validator. The caller must check for `undefined` and return immediately without writing to the response a second time.
- `namedHandler` returns a new function that forwards to the original handler. The original handler's `this` binding is preserved (forwarding via `handler(request, response)`), but any closure over `this` inside the handler would still work only if the handler doesn't rely on `this` being the Express request.
- The module-level doc comment explicitly rejects a `defineController()` wrapper for three reasons (stack-frame indirection, generic erasure of the service result, and hiding `.catch(` from the lint rule). Adding such a wrapper would break `controller-chain-must-catch`.
- `parseBody` merges Zod validation errors and malformed-ID issues into a single 422 body rather than sending two responses, keeping the "one 422 per request" contract.
