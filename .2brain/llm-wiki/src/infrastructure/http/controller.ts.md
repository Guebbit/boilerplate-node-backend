---
source: src/infrastructure/http/controller.ts
sha256: f81c1d30406782215d6a6257b3a4695bbec5c83d803050fcc5b7a2616c25e5cc
generated_at: 2026-11-08T03:28:44.835980+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/controller.ts

## Purpose

Shared helpers that factor out the boilerplate every Express controller repeats — reading and validating input, branching on the service result, and catching database errors — without hiding the `.catch()` call in a wrapper. Expressed as small, individually importable functions rather than a `defineController()` wrapper so that stack traces point at the real handler, the service result stays concrete (not a generic), and the `controller-chain-must-catch` AST lint rule still finds a literal `.catch(` at the call site.

## Key elements

- **`operationName(verb, entity, suffix?)`** — Builds the canonical operation string (e.g. `getItem`, `deleteSession`) used in stack traces, log lines, and generated `docs/modules/` tables. Single source of truth so every controller factory derives the name the same way.
- **`namedHandler(operation, handler)`** — Assigns a computed property name to an Express handler function so the handler appears by name in stack traces. Uses the computed-key trick on a function literal that forwards to the original handler.
- **`ServiceResult<TData>`** — Type alias for `ResponseSuccess<TData> | ResponseReject`, the exact union a service method returns. Keeps controller code from spelling out the two-envelope union repeatedly.
- **`refused(response, result)`** — Type-predicate guard: if `result` is a rejection, sends the error response and returns `true`; otherwise returns `false`. After `if (refused(resp, result)) return;`, TypeScript narrows `result` to `ResponseSuccess<TData>` with no cast.
- **`catchAs(response, context)`** — Returns a ready-to-use `.catch` callback that delegates to `rejectDatabaseError`. The literal `.catch(` stays at the controller call site for the lint rule.
- **`parseBody(schema, body, response)`** — Validates a request body (or query) against a Zod schema. On failure, sends a 422 and returns `undefined`. Also flags malformed ID fields via `malformedIdIssues` so a bad ID is one more 422 field error rather than a downstream database error. Caller must bail on `undefined` without touching the response again.

## Relationships

- **`./response`** — Source of `rejectResponse`, `validationErrors`, `ResponseSuccess`, and `ResponseReject`. The envelope shapes every controller produces.
- **`./errors`** — Provides `rejectDatabaseError`, which `catchAs` delegates to for unexpected database failures.
- **`./ids`** — Provides `malformedIdIssues`, which `parseBody` calls to detect ID fields that don't match this backend's expected format.
- **`infrastructure/surfaces/create-*-controller.ts`** (delete, item, list, restore, search, update) — All six factory helpers import the helpers from this file to build their per-route handlers.
- **`modules/account/controllers/delete-*.ts`** — Concrete module controllers (delete-account, delete-email-change, delete-oauth-link, delete-session) use `operationName`, `namedHandler`, `refused`, `catchAs`, and `parseBody` in their route handlers.
- **`app/config-routes.ts`** — Wires the controller factories above into Express routers; does not import this file directly but the controllers it registers depend on it.
- **`infrastructure/adapters/logger.ts`** — Indirect dependency: `rejectDatabaseError` (in `./errors`) logs through the adapter; the `context` string passed to `catchAs` ultimately appears in that log line.

## Notes

- The module intentionally avoids a `defineController()` wrapper. The three reasons are stated in the file header: (1) stack traces would point at the wrapper, not the handler; (2) the service result would be forced through a generic parameter; (3) `controller-chain-must-catch` walks the AST for a literal `.catch(` and would miss one hidden inside a wrapper.
- `parseBody` both *responds* and *extracts*. The caller is responsible for `if (!body) return;` and must not write to `response` again after a `undefined` return.
- `refused` only handles the rejection side. The success side (200 vs 201, raw vs transformed payload, audit events) is deliberately left to each controller.
- `namedHandler`'s `as THandler` cast is necessary because the computed-key forwarder only exposes the constraint's parameter types, not the caller's narrower signature.
