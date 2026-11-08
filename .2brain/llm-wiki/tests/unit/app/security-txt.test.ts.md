---
source: tests/unit/app/security-txt.test.ts
sha256: 9e54d2abcff6762a6d5b7c47a20eda786dafaec887a5819087c17714ef129ade
generated_at: 2026-11-08T10:03:00.524653+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/security-txt.test.ts

## Purpose

Unit tests for `buildSecurityTxt`, the pure function that renders the `/.well-known/security.txt` body from environment variables. The tests verify correct field ordering, RFC 9116 compliance (required `Expires` field), expiration logic, and optional-field inclusion.

## Key elements

- **`describe('buildSecurityTxt')`** — single test suite; no helper classes or fixtures.
- **`NOW` constant** — a frozen `Date` (`2026-09-29T00:00:00Z`) passed as the second argument to `buildSecurityTxt` so expiration tests are deterministic and don't depend on the real clock.
- **Test cases** (one `it` per scenario):
  - Returns `undefined` when no contact is configured.
  - Returns `undefined` when `NODE_SECURITY_EXPIRES` is missing or unparseable (`'soon'`).
  - Emits exactly `Contact`, `Expires` (normalised to ISO 8601), and `Preferred-Languages: en`; omits unset optionals.
  - Returns `undefined` once `Expires` is in the past, including the boundary case where `Expires === now`.
  - Demonstrates time-relative behaviour: the same settings yield a body at `T-1s` but `undefined` at `T+1s`.
  - Includes `Policy` and `Canonical` lines when `NODE_SECURITY_POLICY_URL` and `NODE_URL` are set.

## Relationships

- **Imports `buildSecurityTxt` from `@app/security-txt`** (`src/app/security-txt.ts`) — the sole SUT. The function is called with a plain env-var object and an optional `Date`; no other project modules are involved.

## Notes

- The second argument to `buildSecurityTxt` (the "now" date) is optional in the API; when omitted the function presumably uses `Date.now()`. All expiration tests supply it explicitly to stay deterministic.
- An `Expires` value that equals `now` exactly is treated as **expired** (closed-interval check), which is called out in the test comment.
- `Preferred-Languages: en` appears unconditionally in the output — it is not gated by an env var.
- `Canonical` is derived from `NODE_URL` by appending `/.well-known/security.txt`; the trailing slash on `NODE_URL` is expected.
- The function returns `undefined` (not an empty string or HTTP 404 signal) to indicate "do not serve this file" — the caller is responsible for that decision.
