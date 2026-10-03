---
source: src/app/security-txt.ts
sha256: 5d52457a10752d36677ef230a647761f0fcfbb73d18b2651bae964d229c47325
generated_at: 2026-10-01T12:44:58.616330+00:00
model: ollama:qwen3.8:27b
---

# src/app/security-txt.ts

## Purpose

Pure helper module that builds the `/.well-known/security.txt` body (RFC 9116) and produces a boot-time warning when the `Expires` field is missing, past, or approaching. Extracted as pure functions over parsed settings so the HTTP route and unit tests share a single source of truth. Off by default: a fork must never accidentally publish the boilerplate author's contact.

## Key elements

- **`SecurityTxtSettings`** (interface) — the subset of parsed environment variables the module reads: `NODE_SECURITY_CONTACT`, `NODE_SECURITY_EXPIRES`, `NODE_SECURITY_POLICY_URL`, `NODE_URL`.
- **`RENEWAL_WINDOW_MS`** (const, private) — 30 days in milliseconds; the threshold that triggers the "renew soon" warning.
- **`parseExpires`** (private function) — parses a raw string into a `Date`; returns `undefined` for empty or unparseable input.
- **`buildSecurityTxt`** (export) — assembles the RFC 9116 text body. Returns `undefined` (→ route 404s) unless both `Contact` and `Expires` are usable. Optionally includes `Policy`, `Preferred-Languages: en`, and `Canonical` lines.
- **`securityTxtWarning`** (export) — given settings and an injectable clock (`now`), returns a human-readable warning string if `Expires` is missing, in the past, or within 30 days; `undefined` when unconfigured or healthy.

## Relationships

- **`src/app/config.ts`** — defines `securityTxtSettings`, the parsed object whose shape matches `SecurityTxtSettings`; this module is the consumer.
- **`src/app/system-routes.ts`** — registers the `/.well-known/security.txt` route; calls `buildSecurityTxt` to get the body (404 when `undefined`) and invokes `securityTxtWarning` at boot.
- **`src/app.ts`** — application entry point that wires config and routes together.
- **`tests/unit/app/security-txt.test.ts`** — exercises `buildSecurityTxt` and `securityTxtWarning` directly, leveraging the injected `now` parameter to avoid real-date dependence.

## Notes

- **Off by default.** The file is published only when *both* `NODE_SECURITY_CONTACT` and a parseable `NODE_SECURITY_EXPIRES` are present. A missing `Expires` with a set `Contact` triggers an explicit boot warning rather than silently publishing.
- **`Expires` normalization.** Input may be a bare date string; the output is always `toISOString()` (full ISO 8601 date-time), satisfying RFC 9116.
- **`Canonical` construction.** Uses `new URL('/.well-known/security.txt', NODE_URL)` so a `NODE_URL` with or without a trailing slash both work.
- **Testability.** `securityTxtWarning` accepts `now: Date` as a parameter (defaults to `new Date()`), letting tests inject a fixed clock.
