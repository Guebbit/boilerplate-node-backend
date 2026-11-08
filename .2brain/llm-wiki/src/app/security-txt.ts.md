---
source: src/app/security-txt.ts
sha256: e283f1d1ca4ac0abfafcd87dc464ea8801c8ce33d4566cba23dbeae3d184a2b7
generated_at: 2026-11-08T03:13:52.203535+00:00
model: ollama:qwen3.8:27b
---

# src/app/security-txt.ts

## Purpose
Pure function that builds the body of `/.well-known/security.txt` (RFC 9116) from parsed environment settings. It exists so the HTTP route and the unit tests share a single source of truth for the file's content, and so expiration logic can be evaluated per-request rather than once at boot.

## Key elements
- **`SecurityTxtSettings`** (interface) — The subset of environment variables this module reads. All fields are optional; the file is published only when `NODE_SECURITY_CONTACT` and a valid `NODE_SECURITY_EXPIRES` are both present.
- **`parseExpires`** (private) — Parses the raw `NODE_SECURITY_EXPIRES` string into a `Date`, returning `undefined` for empty or unparseable input.
- **`buildSecurityTxt`** (exported function) — Returns the RFC 9116 text body, or `undefined` when the deployment hasn't opted in or the expiry date has passed. Accepts an injectable `now: Date` (defaults to `new Date()`) so tests don't depend on the wall clock.

## Relationships
- **`src/app/config.ts`** — Source of the `SecurityTxtSettings` values; this module's doc-comment explicitly references `app/config.ts#securityTxtSettings` as the parsing layer.
- **`src/app/system-routes.ts`** — Consumes `buildSecurityTxt`; when it returns `undefined` the route answers 404, otherwise it serves the returned string as the response body.
- **`tests/unit/app/security-txt.test.ts`** — Exercises `buildSecurityTxt` directly, passing an explicit `now` to cover expiry and opt-out branches without waiting for a real date.

## Notes
- The function is **off by default**: with no `NODE_SECURITY_CONTACT` or `NODE_SECURITY_EXPIRES` set, it returns `undefined` and nothing is published. This is intentional to prevent a fork from leaking the upstream author's contact info.
- Expiry is checked **on every call**, not at startup, because long-running servers would otherwise keep serving a stale file.
- `Expires` is re-serialised via `toISOString()` so that a bare `YYYY-MM-DD` input still produces a valid ISO 8601 date-time in the output.
- `NODE_URL` is normalised through `new URL(...)`, so a trailing slash in the configured origin won't produce a double-slash in the `Canonical` line.
