---
source: shared/cases/request-headers.cases.yaml
sha256: ef1c6c0b5444ec5315cb01ff9e81334acc7a29c219d5e908751cd771dde1928c
generated_at: 2026-11-08T03:06:16.835408+00:00
model: ollama:qwen3.8:27b
---

# shared/cases/request-headers.cases.yaml

## Purpose

Test-case catalogue for two inbound HTTP header parsers: `If-Match` (RFC 9110 §13.1.1) and `x-request-id`. It encodes the expected parse outcome for a range of valid, malformed, and edge-case header values so the parsing logic can be verified against a single declarative source of truth.

## Key elements

- **`if-match` cases** — Each case supplies a raw header string and asserts one of three outcomes:
  - `unconditional` — no header present; the write proceeds without a precondition check.
  - `any` — header is `*` (surrounding whitespace tolerated); any current version matches.
  - `tags` — header is a comma-separated list of entity-tags (strong or weak). The expected `tags` array preserves quotes and `W/` prefixes. An unparseable header also yields `tags` but with an **empty list**, causing the write to be refused (412) rather than run unconditionally.
- **`request-id` cases** — Each case supplies a header value (or absence), a `trustedIngress` flag, and asserts:
  - `clientRequestId: kept | dropped` — whether the value is accepted as a canonical UUID (any version, either case) or rejected.
  - `requestId: generated | client` — the id returned to the caller; `client` only when `trustedIngress` is true **and** the header was kept.
- **Edge cases covered** — trailing newline after a valid UUID, trailing text, missing hyphens, non-hex digit, unquoted tag, star mixed with a tag, trailing comma, empty string.

## Relationships

- **`shared/cases/security-headers.cases.yaml`** — Sibling test-case file in the same `shared/cases/` directory. Both define declarative cases for HTTP header handling (request headers vs. security headers) and are consumed by the same test runner harness; they are expected to stay in lock-step for conventions (field names like `kind`, `header`, `expect`).

## Notes

- A **weak tag** (`W/"a"`) is kept verbatim in the `tags` array; the test suite explicitly asserts it never equals a strong tag (`"a"`). Do not normalise away the `W/` prefix.
- The `*` wildcard is **not** combinable with other tags (`*, "a"` is unparseable). Only a lone `*` (with optional surrounding spaces) maps to `any`.
- The `$` anchor in the UUID regex must not match before a trailing newline — the `"…\n"` case is the regression guard for this.
- When a header is present but unparseable, the outcome is `tags: []` (refuse), **not** `unconditional` (allow). This is a deliberate safety choice documented in the file header.
