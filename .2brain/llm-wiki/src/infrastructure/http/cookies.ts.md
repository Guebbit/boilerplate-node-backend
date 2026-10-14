---
source: src/infrastructure/http/cookies.ts
sha256: f21771af8d5d22b1f2bc4c0b91aa2d5d8ee9d1c303c9a2e868a5e63dc071b607
generated_at: 2026-10-14T07:53:17.993482+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/cookies.ts

## Purpose

Generic transport plumbing that reads a single named cookie value off an incoming Express request. It deliberately stays credential-agnostic: it does not know *which* cookie matters, only how to safely extract a string-valued cookie regardless of what cookie-parser has done to it.

## Key elements

- **`cookieOf(request, name)`** — Returns the cookie's value as a `string`, or `undefined` if the cookie is absent or has been parsed into a non-string (e.g. a `j:`-prefixed JSON object by cookie-parser). Accepts any object shaped like `Pick<Request, 'cookies'>`, so typed controller requests fit without casting at the call site.

## Relationships

- **`src/kernel/cookies.ts`** — Defines the semantic cookie names (e.g. the refresh token). This file is the transport-level reader; `kernel/cookies` is the caller that decides *which* name to pass in.
- **`src/modules/account/controllers/get-oauth-callback.ts`** / **`src/modules/account/oauth/mfa-redirect.ts`** — Account-domain callers that invoke `cookieOf` to pull a specific credential cookie off the request.
- **`tests/unit/infrastructure/http/cookies.test.ts`** — Unit tests covering the string-return, missing-cookie, and `j:`-parsed-object cases.

## Notes

- cookie-parser silently deserialises any value prefixed with `j:` into a JS object. This module guards against that by checking `typeof value === 'string'` before returning; a non-string (object, number, `undefined`) always yields `undefined`. Callers never see an object masquerading as a credential string.
- The single `as Record<string, unknown>` cast inside the function is the only widening needed; callers pass a normally-typed `Request` and need no cast themselves.
