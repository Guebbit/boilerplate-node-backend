---
source: tests/fuzz/ssrf-guard.fuzz.test.ts
sha256: eab4339777aafeb9a3cd695c6e64567b43ec29de100a7d7afe0eda168786dea9
generated_at: 2026-10-15T12:42:46.583573+00:00
model: ollama:qwen3.8:27b
---

# tests/fuzz/ssrf-guard.fuzz.test.ts

## Purpose

Deterministic table-driven test suite for the SSRF guard's `resolveSafeOutboundTarget`. It verifies that the guard refuses every well-known bypass technique (private ranges, loopback, link-local/cloud-metadata, encoded IPv4 literals, 6to4/Teredo, DNS-to-private, credentials, plain-HTTP) and accepts public addresses, while also exercising the pinned-lookup and origin-exemption paths. It lives under `tests/fuzz/` (not under `webhooks/`) because the guard is infrastructure and its tests must survive deletion of the webhook module.

## Key elements

- **`mockDns(v4, v6)`** — local helper that configures the mocked `node:dns/promises` `resolve4`/`resolve6` to return a fixed array of addresses or a rejection.
- **`jest.mock('node:dns/promises', …)`** — replaces the real DNS module so "DNS resolves to private space" cases are fully deterministic; the test never touches a real resolver.
- **`describe('… literal IP hostiles …')`** — 30-case `it.each` table asserting `SsrfRefusedError` with `reason: 'unsafe-address'` for RFC 1918, loopback, link-local, CGNAT, broadcast, multicast, IPv6 ULA/link-local, IPv4-mapped IPv6, decimal/octal/hex literals, NAT64, 6to4, Teredo, and other non-unicast ranges.
- **`describe('… scheme and credential hostiles …')`** — asserts `insecure-scheme`, `credentials-in-url`, and `invalid-url` rejections fire *before* any DNS call.
- **`describe('… DNS answer is private …')`** — fail-closed: any single private address among multiple answers triggers refusal; both A and AAAA failure yields `dns-resolution-failed`.
- **`describe('… literal IP never triggers a DNS query …')`** — asserts `resolve4`/`resolve6` are *not* called for a public literal IP.
- **`describe('… pinned lookup …')`** — verifies `target.lookup` (both `{ all: false }` and `{ all: true }` shapes) returns the single validated address and that DNS was queried exactly once.
- **`describe('… registered exempt origin …')`** — uses `registerSsrfExemptOrigin` / `clearSsrfExemptOrigins` to confirm the exemption is origin-wide (scheme + host + port) but still subject to `insecure-scheme`, `credentials-in-url`, and `unsafe-port` checks.

## Relationships

- **`src/infrastructure/adapters/ssrf-guard.ts`** — the unit under test. This file imports `resolveSafeOutboundTarget` and `SsrfRefusedError`; every assertion is against that function's return value or thrown error shape.
- **`src/infrastructure/adapters/ssrf-exemptions.ts`** — provides `registerSsrfExemptOrigin` and `clearSsrfExemptOrigins`, used in the exemption describe block to register/clear a test origin around each case.

## Notes

- **Not a property-based test.** Despite living in `tests/fuzz/`, it is a fixed table of known-bad inputs, not a `fast-check` arbitrary. Random byte strings would not surface the specific bypass encodings the table targets.
- **6to4 / Teredo are explicitly included** because `embeddedIPv4()` (in the guard) does not unwrap those address forms; without these cases a 6to4 encoding of `169.254.169.254` would pass every other check as a "global" address.
- **Literal IPs short-circuit DNS.** The test asserts `resolve4`/`resolve6` are never called when the host is an IP literal, so those cases need no `mockDns` setup.
- **Exemption does not weaken scheme/credential/port checks.** The exempt-origin block deliberately re-tests `http:`, embedded credentials, and wrong-port to document that the exemption only relaxes the address-range gate.
