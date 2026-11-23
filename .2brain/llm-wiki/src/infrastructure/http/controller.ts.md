---
source: src/infrastructure/http/controller.ts
generated_at: 2026-11-22T02:47:32.750321+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/controller.ts

## Purpose
Shared helpers for the steps every HTTP controller repeats: read input, validate, call one service method, branch on the result, and catch errors. They are plain helpers rather than a `defineController()` wrapper. A wrapper would add a stack frame, force the service result through a generic, and hide the `.catch()` call that the `controller-chain-must-catch` rule looks for in the AST.

## Key elements
- `operationName(verb, entity, suffix?)` builds the operation name (e.g. `getItem`-style names built from a verb, entity and suffix) that appears in stack traces, log lines and the generated `docs/modules/` tables. It joins the verb, the entity with its first letter capitalized, and an optional suffix.
- `namedHandler(operation, handler)` gives an Express handler a real function name. It wraps the handler in a function literal stored under a computed property key, so the literal takes the key's name. The return type is the same as the handler's (`THandler`).
- `ServiceResult<TData>` is `ResponseSuccess<TData> | ResponseReject`, the type a service returns.
- `refused(response, result)` sends the rejection and returns `true` if the service refused. It is a type predicate, so after `if (refused(...)) return;` the result is narrowed to the success variant. It covers only the refusal side; each controller handles success itself.
- `catchAs(response, context)` returns an error callback for `.catch(...)`. It calls `rejectDatabaseError` with the response, the context and the error.
- `parseBody(schema, body, response)` runs `safeParse` on the generated Zod schema. On failure it sends a 422 and returns `undefined`. The 422 combines the Zod validation errors with malformed-id issues for any id field the schema declares.

## Relationships
- Imports `rejectResponse`, `validationErrors` and the `ResponseSuccess`/`ResponseReject` types from `./response`.
- Imports `rejectDatabaseError` from `./errors`, and `catchAs` delegates to it.
- Imports `malformedIdIssues` from `./ids`. `parseBody` uses it so a bad id is reported as a 422 field error rather than a database error. The path-id equivalent is `requireId`, which is not in this file.
- The controller factories in `src/infrastructure/surfaces/` (`create-delete-controller`, `create-item-controller`, `create-list-controller`, `create-restore-controller`, `create-search-controller`, `create-update-controller`) derive handler names from `operationName`. The account controllers under `src/modules/account/controllers/` (`delete-account`, `delete-email-change`, `delete-oauth-link`, `delete-session`) are also graph neighbors.

## Notes
- `parseBody` writes the 422 response itself. Callers must return on `undefined` and must not touch the response again.
- Call sites must keep the literal `.catch(` and pass `catchAs(...)` into it, so the `controller-chain-must-catch` lint rule still finds it.
- `./response` is imported directly because it is a sibling file, not a module. The restriction on `@infrastructure` importing from `@modules` does not apply to it.
