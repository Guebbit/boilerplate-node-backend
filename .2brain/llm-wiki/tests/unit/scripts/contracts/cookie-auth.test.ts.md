---
source: tests/unit/scripts/contracts/cookie-auth.test.ts
sha256: b4e1aecacc6aa290c8af416e0330678db432b2a56b5bd7f59d858755221ce935
generated_at: 2026-10-15T13:25:54.436235+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/cookie-auth.test.ts

## Purpose

Unit tests for the `withCookieAuth` post-bundle step. Verifies that the pure YAML-in/YAML-out transform correctly adds a `cookieAuth` alternative to bearer-secured operations, injects a `403` response on unsafe (non-GET) methods, and leaves public or already-cookie-secured operations untouched.

## Key elements

- **`DOCUMENT`** – A single OpenAPI YAML fixture containing five operations spanning the cases under test: a safe bearer GET, an unsafe bearer POST, an unsafe multi-scheme DELETE with its own `403`, a public POST (`security: []`), and a cookie-only GET.
- **`run()`** – Helper that pipes `DOCUMENT` through `withCookieAuth` and re-parses the output into a typed `{ paths: … }` object for convenient assertions.
- **`describe('withCookieAuth')`** – Five focused assertions:
  - Cookie auth is appended beside (not replacing) the existing bearer entry.
  - Pre-existing alternative schemes (e.g. `apiKeyAuth`) are preserved.
  - A `403` response is added to unsafe methods (POST) but absent on safe ones (GET).
  - An operation's own declared `403` body is never overwritten.
  - Public and already-cookie-secured operations pass through unchanged.

## Relationships

- **`scripts/contracts/cookie-auth.ts`** – The sole production module under test; this file imports its `withCookieAuth` export and exercises its contract.
- **`yaml`** (third-party) – Used in `run()` to serialize/deserialize the YAML string so assertions operate on plain objects rather than raw text.

## Notes

- The fixture is a single shared string; all assertions read from one `run()` call per test. There is no mutation or state between tests.
- "Unsafe" is defined by the implementation as any HTTP method other than GET; the test encodes this convention via the POST/DELETE vs GET contrast.
- The test asserts *exact* arrays (`toEqual`), so ordering of the security list (bearer first, cookie appended last) is part of the contract.
