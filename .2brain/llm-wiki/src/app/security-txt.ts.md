---
source: src/app/security-txt.ts
sha256: e283f1d1ca4ac0abfafcd87dc464ea8801c8ce33d4566cba23dbeae3d184a2b7
generated_at: 2026-10-14T07:38:56.538719+00:00
model: ollama:qwen3.8:27b
---

# src/app/security-txt.ts

## Purpose

Generates the body of `/.well-known/security.txt` (RFC 9116) as a pure function over already-parsed environment settings. It exists so the HTTP route and the unit tests share a single source of truth for the file's content and its publish-or-404 logic.

## Key elements

- **`SecurityTxtSettings`** (exported interface) — the subset of environment variables the module reads: `NODE_SECURITY_CONTACT`, `NODE_SECURITY_EXPIRES`, `NODE_SECURITY_POLICY_URL`, `NODE_URL`.
- **`buildSecurityTxt(environment, now?)`** (exported function) — returns the RFC 9116 text body **or `undefined`** when the deployment hasn't opted in (missing `Contact` or `Expires`) or when `Expires` has already passed. Accepts an optional `now: Date` so tests can inject a clock.
- **`parseExpires(raw)`** (private) — coerces the raw `NODE_SECURITY_EXPIRES` string into a `Date`, returning `undefined` for empty or unparseable input.

## Relationships

- **`src/app/config.ts`** — Supplies the parsed environment values that populate `SecurityTxtSettings`. This module consumes them read-only; it does not import `config.ts` directly but the interface is typed to match what `config.ts#securityTxtSettings` produces.
- **`src/app/system-routes.ts`** — Registers the `/.well-known/security.txt` route, calls `buildSecurityTxt`, and responds 404 when the function returns `undefined`.
- **`tests/unit/app/security-txt.test.ts`** — Exercises `buildSecurityTxt` with a fixed `now` value to verify the contact/expires gating, optional fields, and ISO-8601 serialisation without waiting for a real date.

## Notes

- **Off by default.** If `NODE_SECURITY_CONTACT` or `NODE_SECURITY_EXPIRES` is absent/blank, the function returns `undefined` and the route must answer 404. This prevents a fork from accidentally publishing a boilerplate author's contact.
- **Expiry is evaluated per-request, not at boot.** A long-running server will stop publishing once the calendar passes `Expires` without a restart.
- **`Canonical` line** is derived via `new URL('/.well-known/security.txt', NODE_URL)`, which normalises trailing-slash differences in `NODE_URL`.
- **`Policy` and `Canonical`** are omitted entirely (not emitted as blank lines) when their source variables are unset.
