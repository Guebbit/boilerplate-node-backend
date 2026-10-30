---
source: src/modules/account/controllers/post-session-touch.ts
sha256: a453fcaf2cc3d1fa8187cc27ef17e0e81ecadd5610786ba86233c4aef2538491
generated_at: 2026-10-29T02:32:23.093096+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-session-touch.ts

## Purpose

Handler for `POST /account/sessions/current/touch`. It does **not** write any activity data — it simply reads the current idle clock (already advanced by upstream auth middleware) and returns the server-side session-activity snapshot so a client can drive a "still there?" prompt from authoritative numbers.

## Key elements

- **`postSessionTouch`** (exported) — Express handler. Resolves the role-appropriate idle limit, then sends a `200` with a `SessionActivity` body:
  - `lastActiveAt` — current ISO timestamp.
  - `idleTimeoutSeconds` — included **only** when the role's limit is > 0 (conditional spread), expressed in seconds.
- Error path is delegated to `catchAs(response, 'postSessionTouch')`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/controller.ts` | Supplies `catchAs`, the shared error-catch helper used in the `.catch()` chain. |
| `src/infrastructure/http/response.ts` | Supplies `successResponse`, the standardised JSON response writer. |
| `src/modules/account/routes.ts` | Registers `postSessionTouch` on the `POST /account/sessions/current/touch` route (with `getAuth` middleware preceding it). |
| `src/modules/account/session/idle.ts` | Imports `idleLimitMilliseconds(roles)` to resolve the role-specific idle ceiling. |
| `src/types/index.ts` | Imports the `SessionActivity` type that shapes the response body. |

## Notes

- **No DB write.** The module docblock and the handler comment both state that `getAuth` has already recorded activity before this handler runs; the handler is purely a read-and-respond step.
- **Non-null assertion.** `request.authContext!` assumes the auth middleware populated the context; a missing context would throw inside `.then()` and be caught by `catchAs`.
- **Conditional field.** `idleTimeoutSeconds` is omitted entirely when the limit is `0`, so clients must treat the field as optional.
- **No `async/await`.** The handler uses an explicit `Promise.resolve().then().catch()` chain, consistent with the project's controller style (see `catchAs` usage).
