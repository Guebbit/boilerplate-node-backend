---
source: src/modules/account/controllers/delete-oauth-link.ts
sha256: a7c6183646aacdc0f3298633f76cb0f8a673035ede30f182281d09a3e28a1db7
generated_at: 2026-10-14T08:29:45.447720+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-oauth-link.ts

## Purpose

Thin HTTP adapter that exposes `DELETE /account/oauth/links/{provider}`. It extracts the caller's account ID, provider name, and caller context from the request, delegates to `accountService.unlinkOAuthProvider`, and translates the boolean result into a 200 or 404 JSON response.

## Key elements

- **`deleteOAuthLink`** (exported const) — The sole handler. Accepts Express `Request<{ provider: string }>` and `Response`. Calls `accountService.unlinkOAuthProvider(accountId, provider, callerContext)`, then:
  - `removed === false` → 404 with i18n key `account.oauth.link-not-found`
  - `removed === true` → 200 with i18n key `account.oauth.link-removed` and an `undefined` body
  - Any thrown error is routed to `catchAs(response, 'deleteOAuthLink')`

## Relationships

- **`src/modules/account/services/index.ts`** — Source of `accountService.unlinkOAuthProvider`, the actual business logic (returns a boolean indicating whether a link existed and was removed).
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` / `rejectResponse` used to shape the JSON envelope.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the uniform error-to-response helper.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, which extracts IP/UA context for the service call.
- **`src/infrastructure/i18n/index.ts`** — Provides `t` for internationalized message strings.
- **`src/modules/account/routes.ts`** — Registers this handler on the `DELETE /account/oauth/links/:provider` path and wraps it with a fresh-session guard (removing a credential is treated as an identity change).

## Notes

- `request.authContext!.id` is accessed with a non-null assertion; the session middleware upstream is expected to have populated it.
- The route is gated by a **fresh-session guard** (not visible in this file, enforced in `routes.ts`), meaning the user must re-authenticate immediately before unlinking.
- The success body is explicitly `undefined` (`successResponse<undefined>`)—clients should rely on the 200 status and message string rather than a payload.
- Errors are not individually mapped; `catchAs` handles all thrown exceptions uniformly.
