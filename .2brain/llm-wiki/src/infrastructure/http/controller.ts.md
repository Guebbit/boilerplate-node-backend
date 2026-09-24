---
source: src/infrastructure/http/controller.ts
sha256: 0997b2b8adaa691a655901be3b809b7140506b72fa0c770c6d1043c9ddcb263b
generated_at: 2026-09-23T17:42:17.313208+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/controller.ts

## Purpose

Shared helper functions that implement the four steps every Express controller repeats — read input, validate, call a service method, branch on the result, and catch errors. They exist as standalone helpers (rather than a `defineController()` wrapper) so that each controller's call site keeps its stack frame, its concrete generic, and its visible `.catch(` token intact for the `controller-chain-must-catch` AST lint rule.

## Key elements

- **`operationName(verb, entity, suffix?)`** – Builds the canonical operation string (e.g. `getAccountItem`) used in stack traces, log lines, and generated docs tables.
- **`namedHandler(operation, handler)`** – Assigns a runtime `.name` to an anonymous Express handler via a computed-property-key trick, replacing the default `"anonymous"` in traces and logs.
- **`ServiceResult<TData>`** – Type alias for `ResponseSuccess<TData> | ResponseReject`, the shape a service method returns.
- **`refused<TData>(response, result)`** – Type-predicate that, when the result is a rejection, sends the error response and returns `true`; otherwise returns `false` leaving the success path to the caller.
- **`catchAs(response, context)`** – Returns a `.catch` callback that delegates to `rejectDatabaseError`.
- **`catchAsNotFound(response, context, notFoundKey)`** – Returns a `.catch` callback that maps a bad `ObjectId` (`CastError`) to a 404 with the given i18n key, falling through to `rejectDatabaseError` for everything else.
- **`rejectValidation(response, error)`** – Sends a 422 with Zod-formatted validation messages.
- **`parseBody(schema, body, response)`** – Safely parses a request body against a Zod schema; on failure sends 422 and returns `undefined` (caller must bail).

## Relationships

- **`./response`** (`src/infrastructure/http/response.ts`) – Supplies `rejectResponse`, `validationErrors`, and the `ResponseSuccess` / `ResponseReject` types used throughout.
- **`./errors`** (`src/infrastructure/http/errors.ts`) – Supplies `rejectDatabaseError`, which `catchAs` and `catchAsNotFound` delegate to for non-ObjectId errors.
- **`@infrastructure/i18n`** (`src/infrastructure/i18n/index.ts`) – Supplies the `t()` translation function used by `catchAsNotFound` to resolve the 404 message key.
- **`@infrastructure/persistence/mongo-errors`** (`src/infrastructure/persistence/mongo-errors.ts`) – Supplies `isBadObjectId` so `catchAsNotFound` can distinguish a `CastError` from a genuine "not found."
- **`surfaces/create-*-controller.ts`** (create-delete, create-item, create-list, create-search) – Controller factories that import `operationName`, `namedHandler`, `parseBody`, `refused`, `catchAs`, and `catchAsNotFound` to build their Express handlers.
- **`modules/account/controllers/delete-*.ts`** (delete-2fa, delete-2fa-method, delete-account-confirm, delete-account-request, delete-expired-tokens, delete-session) – Concrete account controllers that consume the same helpers for their request pipelines.

## Notes

- **Helpers, not a wrapper, by design.** A `defineController()` wrapper would add a stack frame that obscures the real handler in traces, force the service result through a generic, and hide the `.catch(` call that the `controller-chain-must-catch` lint rule walks the AST to find. The helpers avoid all three.
- **`namedHandler` uses a computed property key** (`({ [operation]: handler })[operation]`) because a function expression's `.name` is read-only once assigned, whereas an object-literal method inherits its name from the key.
- **`parseBody` both validates and responds.** The caller is responsible for bailing on `undefined` without touching `response` again (`if (!body) return;`).
- **`refused` is a type predicate**, not just a boolean return — after `if (refused(response, result)) return;`, TypeScript narrows `result` to `ResponseSuccess<TData>` with no cast needed.
- **`catchAsNotFound` exists for routes where a malformed ObjectId and a missing record are indistinguishable from the client's perspective** (both should be 404). Without it, `rejectDatabaseError` would answer a Mongoose `CastError` with 422.
