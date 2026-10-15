---
source: tests/support/cookies.ts
sha256: ec51512cab246be70205a8644bd24d721dcd0e01c7a50f71d11bc05f786d56b4
generated_at: 2026-10-15T12:57:17.949606+00:00
model: ollama:qwen3.8:27b
---

# tests/support/cookies.ts

## Purpose

Test-support utilities for reading `Set-Cookie` responses in supertest-based tests. Superagent types the header bag as a flat `Record<string, string>`, but Node returns `set-cookie` as an array (or a bare string when only one cookie is set). These helpers normalise both shapes so individual tests don't need to cast or branch on the header's runtime type.

## Key elements

- **`setCookie(response, name)`** — Looks up the full `Set-Cookie` directive string for a given cookie name. Accepts a response whose `headers` may hold `set-cookie` as a string, an array, or absent. Returns the matched directive or `undefined`.
- **`cookieValue(cookie)`** — Extracts the value portion from a cookie string (the text between the first `=` and the first `;`), applying `decodeURIComponent` to the result.
- **`cookieHeader(response, ...names)`** — Rebuilds a single `Cookie` request header from the response's `Set-Cookie` directives for the given names, trimming each at the first `;`. Throws an `Error` if the response set no cookie by one of the requested names.

## Relationships

Every graph neighbor is a test file (contract, integration, and API-key suites) that imports these helpers to:

- Assert on specific `Set-Cookie` values after login, OAuth, revocation, or session endpoints.
- Carry cookies forward between sequential supertest calls (e.g., `two-factor.test.ts`, `session-remint-amr.test.ts`) via `cookieHeader`.
- Inspect cookie attributes or values in hardening and budget tests (`cookie-hardening.test.ts`, `device-cookie-budget.test.ts`) via `cookieValue`.

The module is consumed exclusively by tests; no production code imports it.

## Notes

- `setCookie` matches by `startsWith(`${name}=`)`, so a cookie named `session` will **not** match `session-v2`.
- `cookieValue` calls `decodeURIComponent` unconditionally; a cookie value that is not valid percent-encoding will throw.
- `cookieHeader` is strict: a missing cookie is treated as a caller bug and throws rather than returning a partial header.
- All three functions type the response param as `{ headers: Record<string, unknown> }` rather than the concrete supertest type, keeping the helpers decoupled from the HTTP library.
