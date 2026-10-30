---
source: src/infrastructure/http/controller.ts
sha256: f81c1d30406782215d6a6257b3a4695bbec5c83d803050fcc5b7a2616c25e5cc
generated_at: 2026-10-29T02:01:06.987017+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/controller.ts

## Purpose

Shared helpers for the four steps every HTTP controller repeats—read input, validate, call one service method, branch on the result, and catch errors. Written as small, composable functions rather than a `defineController()` wrapper so that each handler's `.catch()` call, service-result generic, and stack-frame name remain visible to the `controller-chain-must-catch` AST lint rule.

## Key elements

- **`operationName(verb, entity, suffix?)`** – Builds a human-readable operation name (e.g. `getAccount`, `deleteSessionItem`) from a verb, entity, and optional disambiguating suffix. Single source of truth for the name printed in stack traces, log lines, and generated `docs/modules/` tables.
- **`namedHandler(operation, handler)`** – Returns an Express handler whose `Function.name` is set to `operation` via a computed-property-key literal trick, so stack traces and logs show the real operation instead of an anonymous name.
- **`ServiceResult<TData>`** (type) – Alias for `ResponseSuccess<TData> | ResponseReject`, the exact union a service method returns. Named here because controllers reference "the service result" more often than the two envelope halves.
- **`refused<TData>(response, result)`** (type predicate) – Sends the rejection HTTP response when `result.success` is `false` and returns `true`. After the guard, TypeScript narrows the remaining `result` to `ResponseSuccess<TData>` with `data` present. Covers the refusal half only; the success path is left to each controller.
- **`catchAs(response, context)`** – Returns a `.catch` callback that delegates to `rejectDatabaseError`. The literal `.catch(` stays at the call site in each controller, satisfying the lint rule.
- **`parseBody<TSchema>(schema, body, response)`** – Safe-parses a request body or query against a generated Zod schema. Also checks id fields declared in the schema for backend-specific format violations (via `malformedIdIssues`). Responds 422 itself on failure and returns `undefined`; the caller must bail out without touching the response again.

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports `rejectResponse`, `validationErrors`, `ResponseSuccess`, `ResponseReject`. All HTTP response-sending logic lives in that file; this file only *calls* into it.
- **`src/infrastructure/http/errors.ts`** — Imports `rejectDatabaseError`, used by `catchAs` to shape the 500 response and log line.
- **`src/infrastructure/http/ids.ts`** — Imports `malformedIdIssues`, called inside `parseBody` to flag id fields that pass Zod but violate the backend's own id format.
- **`src/infrastructure/adapters/logger.ts`** — Indirect consumer: `rejectDatabaseError` (in `errors.ts`) and `catchAs`'s `context` parameter are ultimately recorded through the logger adapter.
- **`src/infrastructure/surfaces/create-*-controller.ts`** (create-delete, create-item, create-list, create-restore, create-search, create-update) — Factory helpers that import `operationName`, `namedHandler`, `refused`, `catchAs`, and `parseBody` to wire up generic CRUD-style handlers.
- **`src/modules/account/controllers/*`** (cancel-pending-email, delete-account, delete-oauth-link, delete-session, get-2fa, …) — Domain-specific controllers that consume the same helpers for non-CRUD account operations.

## Notes

- **No wrapper by design.** A `defineController()` function would add an extra stack frame, force the service result through a generic type, and hide the `.catch()` call from the `controller-chain-must-catch` AST walker. Helpers avoid all three.
- **`parseBody` both responds and returns.** On validation failure it sends a 422 *and* returns `undefined`. The caller pattern is `const body = parseBody(…); if (!body) return;`—do not touch the response after a failed `parseBody`.
- **`namedHandler` uses a computed property key, not `Object.defineProperty`.** A function *literal* written under a computed key inherits the key's name; a reference stored under the key does not. The `as THandler` cast is needed because the compiler only sees the constraint, not the caller's narrower parameter/return types.
- **`refused` is a type guard, not a side-effect-free check.** It sends the HTTP response as a side effect. Call it exactly once per request.
