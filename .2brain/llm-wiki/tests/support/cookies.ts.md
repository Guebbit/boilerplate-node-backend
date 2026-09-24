---
source: tests/support/cookies.ts
sha256: 8f8fdbac2af412e92189223ff9acba1aff071f032cd8b0de432c009939c1771e
generated_at: 2026-09-23T20:10:16.491443+00:00
model: ollama:qwen3.8:27b
---

# tests/support/cookies.ts

## Purpose

Small helper module that normalises reading `Set-Cookie` values off a supertest/superagent response. Superagent types the header bag as a flat `Record<string, string>`, but Node delivers `set-cookie` as an **array** (or a bare string when only one cookie was set). These helpers hide that shape ambiguity so contract tests can extract and forward cookies without casting or branching.

## Key elements

- **`setCookie(response, name): string | undefined`** — Looks up the `set-cookie` header (handling both array and single-string shapes), then returns the full `Set-Cookie` directive string for the cookie whose value starts with `<name>=`. Returns `undefined` if no such cookie was set.
- **`cookieHeader(response, ...names): string`** — Builds a `Cookie` request-header string (e.g. `"sid=abc; token=xyz"`) from one or more named cookies in the response. Each directive is truncated at the first `;` to drop `Path`, `Domain`, `Expires`, etc. **Throws** if any requested name is missing.

Both accept a minimal structural type `{ headers: Record<string, unknown> }` rather than a full supertest `Response`, so they work with any object carrying a headers bag.

## Relationships

- **`src/modules/account/tests/contract/api.contract.test.ts`** — Consumes `setCookie` / `cookieHeader` to pull session or auth cookies from API responses and replay them on follow-up requests within the same test.
- **`src/modules/account/tests/contract/oauth.contract.test.ts`** — Same usage pattern in the OAuth flow tests: extracts cookies set by the OAuth callback endpoint and carries them into subsequent API calls.

## Notes

- `cookieHeader` treats a missing named cookie as a **caller bug** and throws immediately rather than returning `undefined` or an empty string. If a test is conditional on a cookie possibly being absent, it must check with `setCookie` first.
- Matching in `setCookie` is a simple `startsWith("<name>=")` prefix check; cookie names that are prefixes of each other (e.g. `id` vs `id_v2`) will not collide because the trailing `=` anchors the match.
- The module is a `@module` (no default export); import the two named functions directly.
