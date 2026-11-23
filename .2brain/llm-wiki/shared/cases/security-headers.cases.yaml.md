---
source: shared/cases/security-headers.cases.yaml
source_sha256: c9206689c63f489ec233914e8d3f4443a6387c394c5d47af9a595c0be863b74e
context_sha256: 239ccb99bbbe781a1cbfb21e104f378a1a11d6a124062e5a27ceb3b8d3429fd4
generated_at: 2026-11-22T02:22:19.195590+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/cases/security-headers.cases.yaml

## Purpose
A declarative list of test cases describing the security headers every HTTP response must carry, regardless of route. They reflect what `installSecurity` sets via helmet's defaults. The same cases apply to the "twin" implementation, which must set identical headers and values.

## Key elements
Each entry under `cases:` has a `name`, a case-insensitive `header`, and either:
- `value`: the exact expected header value, or
- `absent: true`: the header must not be present.

Headers covered:
- `Content-Security-Policy`: `default-src 'self'` plus restrictions on base-uri, font-src, form-action, frame-ancestors, img-src, object-src (`'none'`), script-src, script-src-attr (`'none'`), style-src (allows `https:` and `'unsafe-inline'`), and `upgrade-insecure-requests`.
- `Cross-Origin-Opener-Policy`: `same-origin`.
- `Cross-Origin-Resource-Policy`: `same-origin`.
- `Origin-Agent-Cluster`: `?1`.
- `Referrer-Policy`: `no-referrer`.
- `Strict-Transport-Security`: `max-age=31536000; includeSubDomains`.
- `X-Content-Type-Options`: `nosniff`.
- `X-DNS-Prefetch-Control`: `off`.
- `X-Download-Options`: `noopen`.
- `X-Frame-Options`: `SAMEORIGIN`.
- `X-Permitted-Cross-Domain-Policies`: `none`.
- `X-XSS-Protection`: `0`.
- `X-Powered-By`: absent.
- `Vary`: `Origin`, so shared caches can't mix CORS variants.

## Relationships
- `scripts/audit/api-standards.yaml` is its graph neighbor. The file content doesn't show how the two interact, so no specific link is documented here.

## Notes
- The CSP is compared as helmet 8 writes it: directives joined with `;` and no space. If a helmet upgrade changes a default, this file fails and the twin must be updated to the new value.
- Values like `'off'`, `'0'` and `'?1'` are quoted in the YAML so they stay strings.
