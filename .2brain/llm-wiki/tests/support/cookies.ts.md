---
source: tests/support/cookies.ts
sha256: ec51512cab246be70205a8644bd24d721dcd0e01c7a50f71d11bc05f786d56b4
generated_at: 2026-11-08T09:53:31.057433+00:00
model: ollama:qwen3.8:27b
---

# tests/support/cookies.ts

## Purpose

Normalises the two shapes Node/supertest return for `set-cookie` (array vs. single string) and provides small helpers so account-module tests can read, extract, and forward cookies without manual casting or header parsing in every test case.

## Key elements

- **`setCookie(response, name)`** — Returns the full `Set-Cookie` directive string (e.g. `sid=abc; Path=/; HttpOnly`) for a named cookie, or `undefined`. Accepts any object with a `headers` bag; handles both array and single-string `set-cookie` values.
- **`cookieValue(cookie)`** — Given a `name=value; attrs…` string, returns the URL-decoded value portion (between the first `=` and the first `;`).
- **`cookieHeader(response, …names)`** — Builds a single `Cookie` request-header string (`name=value; name2=value2`) by extracting the named cookies from the response and trimming all attributes after the first `;`. Throws if any requested name is missing.

## Relationships

- Consumed by every contract and integration test under `src/modules/account/tests/` (e.g. `api.contract.test.ts`, `login-restore.test.ts`, `cookie-hardening.test.ts`, `session-epoch.test.ts`, `delete-account.test.ts`, `idle-timeout.test.ts`, `oauth-provider-route.test.ts`, `auth-races.test.ts`, etc.) to pull session/device cookies out of supertest responses and re-attach them on follow-up requests.
- `src/modules/account/tests/contract/support.ts` likely re-exports or wraps these helpers for the contract-test suite specifically.

## Notes

- `setCookie` matches by `name=` prefix, so a cookie named `id` will *not* accidentally match `sid=…` (the check is `startsWith("id=")`).
- `cookieHeader` is strict: a missing cookie name throws immediately, which is intentional — it surfaces a test bug (wrong expected cookie name) rather than silently sending an incomplete header.
- The `headers` parameter is typed as `Record<string, unknown>` (not `Record<string, string>`) specifically to avoid the superagent typing mismatch described in the module docblock.
