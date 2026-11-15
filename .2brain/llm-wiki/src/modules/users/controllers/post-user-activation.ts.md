---
source: src/modules/users/controllers/post-user-activation.ts
sha256: f079306d97aba834d4ad5aeb8c82ba2e226cd372154ba8144bd02315fa35d904
generated_at: 2026-11-14T22:20:39.569150+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/post-user-activation.ts

## Purpose

Thin HTTP controller layer for `POST /users/:id/activate` and `POST /users/:id/deactivate`. It extracts the user id, calls the appropriate `userService` method, and serializes the result into a 200 response with ETag/Location headers. All business rules (404, 403 for staff, 409 for a repeat, audit logging) live in the service, not here.

## Key elements

- **`switchHandler(name, move)`** (internal) — Factory that builds a single Express handler. Steps: validate `:id` via `requireId`, extract `callerContextOf`, invoke the service `move`, check `refused` for service-level denials, map the result through `userService.toUserContract`, set resource headers (`answerAsResource`), and send `successResponse`. Errors fall through to `catchAs`.
- **`postActivate`** (exported) — `switchHandler('activateUserById', …)` → calls `userService.activate`. Lets a deactivated account sign in again.
- **`postDeactivate`** (exported) — `switchHandler('deactivateUserById', …)` → calls `userService.deactivate`. Locks the account out and ends its sessions.

## Relationships

- **`@infrastructure/http/controller`** — supplies `namedHandler` (wraps handler with operationId for logging), `refused` (short-circuits on 403/409 from the service), and `catchAs` (catches thrown errors into an HTTP error response).
- **`@infrastructure/http/ids`** — `requireId` validates the `:id` route param and writes a 404 if missing/invalid.
- **`@infrastructure/http/preconditions`** — `answerAsResource` sets `ETag` and `Location` headers.
- **`@infrastructure/http/request`** — `callerContextOf` reads the authenticated caller's identity/permissions from the request for the service call.
- **`@infrastructure/http/response`** — `successResponse` writes the JSON body and status code.
- **`../services/index` (`userService`)** — owns all domain logic: 404, 403 (staff self-operation), 409 (repeat), audit row, and the `toUserContract` projection.
- **`../routes`** — registers `postActivate` / `postDeactivate` on the `/users/:id/activate|deactivate` paths.

## Notes

- The controller is intentionally stateless: it never touches the database directly and contains no business rules. If a new guard (e.g. "can't deactivate yourself") is needed, it belongs in `userService`, not here.
- Early-return pattern: when `requireId` fails the handler returns `Promise.resolve()` rather than `undefined`, so the Express chain stays consistent without an unhandled-rejection risk.
- `toUserContract` is called with `context.caller`, meaning the serialized user shape can differ per caller (e.g. masking fields for non-admin staff).
