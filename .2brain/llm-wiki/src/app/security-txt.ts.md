---
source: src/app/security-txt.ts
source_sha256: bf16662bec5d8365f65a2553414ec4d294c76b2fb341df987c7e9d2e56942b5f
context_sha256: c05f75ebb8f06eff5198399f4240a8cd9e98194ba12f62ad72e75209265968bc
generated_at: 2026-11-22T02:31:22.518643+00:00
model: claude-code:claude-sonnet-5-5
---

# src/app/security-txt.ts

## Purpose
Builds the body of the `/.well-known/security.txt` file (RFC 9116) as a pure function over already-parsed settings, so the route and the tests share one source. Publishing is opt-in: a fork must not publish the boilerplate author's contact, and an expired file must not be trusted (RFC 9116 §2.5.5).

## Key elements
- `SecurityTxtSettings` (interface): the parsed variables the builder reads. All are optional strings:
  - `NODE_SECURITY_CONTACT`
  - `NODE_SECURITY_EXPIRES` (ISO date)
  - `NODE_SECURITY_POLICY_URL`
  - `NODE_URL` (the API's own origin)
- `parseExpires(raw)` (private): returns a `Date`, or `undefined` if the value is unset, blank, or not a parseable date.
- `buildSecurityTxt(environment, now = new Date())`: returns the file text, or `undefined` when nothing should be published. It returns `undefined` if `Contact` is missing or blank, if `Expires` is missing or unparseable, or if `Expires` is not strictly after `now`.

## Output format
Lines are joined with `\n`, with a trailing newline:
- `Contact: <contact>`
- `Expires: <ISO 8601 via toISOString()>`
- `Policy: <url>`, only if a policy URL is set
- `Preferred-Languages: en`, always present
- `Canonical: <NODE_URL>/.well-known/security.txt`, only if `NODE_URL` is set

## Relationships
- `src/app/config.ts`: the settings type's doc comment points to `config.ts#securityTxtSettings` as the source of the parsed values. The file itself imports nothing.
- `src/app/system-routes.ts`: the route that serves the file. Per the doc comments, it answers 404 when `buildSecurityTxt` returns `undefined`.
- `tests/unit/app/security-txt.test.ts`: tests the function, using the injected `now` clock so they don't wait for a date.

## Notes
- Expiry is checked on every call, not at boot, because a server can run for months.
- `Contact` and `Expires` are the only fields RFC 9116 requires, so both must be usable for the file to appear.
- Re-serialising `Expires` through `toISOString()` means a bare date such as `2027-01-01` is also accepted and output as a full date-time.
- `new URL(...)` handles a `NODE_URL` with or without a trailing slash.
- `Preferred-Languages` is hardcoded to `en`.
