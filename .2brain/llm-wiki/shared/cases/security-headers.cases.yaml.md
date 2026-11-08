---
source: shared/cases/security-headers.cases.yaml
sha256: c9206689c63f489ec233914e8d3f4443a6387c394c5d47af9a595c0be863b74e
generated_at: 2026-11-08T03:06:26.366090+00:00
model: ollama:qwen3.8:27b
---

# shared/cases/security-headers.cases.yaml

## Purpose

Defines the exact set of security headers that **every** response must carry, regardless of route. It encodes helmet 8's defaults as an assertion list so that any change to a header's presence, value, or casing fails the test suite immediately. The file exists as the "twin" counterpart to `request-headers.cases.yaml`: both set the same headers with the same values, and one updates when the other does.

## Key elements

- **`cases`** — Ordered list of 14 assertions. Each entry has:
  - `name` — Human-readable description of the guarantee.
  - `header` — The exact header name (case-insensitive in the wire format, but matched case-insensitively here).
  - `value` — The exact string the response header must equal (CSP, COOP, CORP, HSTS, etc.).
  - `absent` — Boolean; when `true` (only used by `X-Powered-By`) the header must **not** appear at all.
- **`Content-Security-Policy`** — Compared as a single string exactly as helmet 8 emits it: directives joined with `;` and **no space** after each semicolon. This is the most fragile assertion in the file.
- **`Vary: Origin`** — Ensures shared HTTP caches cannot mix CORS variants of the same response.

## Relationships

- **`shared/cases/request-headers.cases.yaml`** — The "twin" file. The top-of-file comment states explicitly: "The twin sets the same ones, with the same values." Both files must be updated together whenever a header value changes (e.g., after a helmet upgrade).

## Notes

- **CSP formatting is brittle.** The value is matched as a literal string with `;` separators and no trailing space. A helmet upgrade that reorders directives, adds a space, or introduces a new directive will fail this case. Update the value here *and* in the twin file.
- **`absent` vs `value`.** The schema supports two mutually exclusive keys. Only `X-Powered-By` uses `absent: true`; every other case uses `value`. Do not set both on the same entry.
- **Case sensitivity of header names.** The header names in this file use standard capitalization (e.g. `X-Frame-Options`), but the comment notes matching is case-insensitive. The *values*, however, are compared exactly as written (e.g. `SAMEORIGIN` not `sameorigin`, `noopen` not `NoOpen`).
