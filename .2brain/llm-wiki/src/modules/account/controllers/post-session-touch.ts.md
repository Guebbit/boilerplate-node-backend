---
source: src/modules/account/controllers/post-session-touch.ts
sha256: 29fef6f1ca6fe5cd57d379d46fa2aacd278a47200965ad4914f732536ef35dbb
generated_at: 2026-10-15T09:56:01.897484+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-session-touch.ts

## Purpose

Controller for `POST /account/session/touch`. It reports the caller's current session idle-clock state back to the client so the UI can render a "still there?" prompt. No activity is written by this handler—the `getAuth` middleware upstream has already counted the request as active.

## Key elements

- **`postSessionTouch(request, response)`** — the sole export. Resolves immediately, reads `idleLimitMilliseconds` for the caller's roles, and responds with a `SessionActivity` payload containing `lastActiveAt` (current time, ISO 8601) and, when a non-zero idle limit applies, `idleTimeoutSeconds`. The success message is i18n-looked-up via `t('account.session-touched')`. Errors are funneled through `catchAs`.

## Relationships

- **`src/modules/account/session/idle.ts`** — supplies `idleLimitMilliseconds(roles)`, the per-role idle ceiling used to populate `idleTimeoutSeconds`.
- **`src/infrastructure/http/response.ts`** — `successResponse` shapes the JSON envelope and sets the status code.
- **`src/infrastructure/http/controller.ts`** — `catchAs` wraps the promise rejection path into a standard error response.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — provides the `t()` translation function for the success message.
- **`src/types/index.ts`** — defines the `SessionActivity` interface used as the response body type.
- **`src/modules/account/routes.ts`** — registers `postSessionTouch` on the `/account/session/touch` route (with `getAuth` middleware upstream).

## Notes

- The handler is intentionally read-only. Activity counting happens in the `getAuth` middleware (the route is *not* marked passive), so this endpoint merely reflects the clock state *after* that middleware has already updated it.
- `idleTimeoutSeconds` is omitted entirely (not set to `0`) when the role has no idle limit (`limitMilliseconds <= 0`), keeping the payload lean for roles that never time out.
- `request.authContext!` is asserted non-null; the `!` relies on `getAuth` having run first—calling this route without that middleware would crash.
