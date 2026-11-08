---
source: src/infrastructure/http/cookies.ts
sha256: f21771af8d5d22b1f2bc4c0b91aa2d5d8ee9d1c303c9a2e868a5e63dc071b607
generated_at: 2026-11-08T03:28:53.000031+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/cookies.ts

## Purpose

Single-purpose transport helper that reads one named cookie off an Express request and returns it as a string (or `undefined`). It is deliberately cookie-name-agnostic: it does not know which cookie is a credential. That concern lives in `@kernel/cookies` and its callers.

## Key elements

- **`cookieOf(request, name): string | undefined`** — The sole export. Accepts any object shaped like `Pick<Request, 'cookies'>`, so it works with fully typed Express `Request<…>` subtypes held by controllers. Returns the cookie value only if it is a plain `string`; otherwise (absent, `null`, or a parsed-JSON object) it returns `undefined`.

## Relationships

- **`src/kernel/cookies.ts`** — Declared in the module docblock as the layer that *names* the refresh-token cookie. `cookieOf` is the generic read primitive; kernel/cookies is the policy layer that decides *which* name to pass in.
- **`src/modules/account/controllers/get-oauth-callback.ts`**, **`src/modules/account/oauth/deletion-redirect.ts`**, **`src/modules/account/oauth/mfa-redirect.ts`** — Consumer modules in the account/OAuth flow that call `cookieOf` to extract their specific cookie from the incoming request.
- **`tests/unit/infrastructure/http/cookies.test.ts`** — Unit tests covering the happy path and the non-string guard.

## Notes

- The `as Record<string, unknown>` cast exists because `cookie-parser` silently converts any value prefixed with `j:` into a parsed JSON object. Without the runtime `typeof` check, that object could leak out as a "credential string." This is the one non-obvious reason the function isn't a one-liner `request.cookies[name]`.
- The parameter type is `Pick<Request, 'cookies'>`, not `Request`, so it remains transport-agnostic and testable with a plain `{ cookies: { … } }` stub.
- This file imports only the `Request` *type* from Express; there is no runtime Express dependency.
