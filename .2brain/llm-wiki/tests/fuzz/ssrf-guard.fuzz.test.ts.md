---
source: tests/fuzz/ssrf-guard.fuzz.test.ts
sha256: eab4339777aafeb9a3cd695c6e64567b43ec29de100a7d7afe0eda168786dea9
generated_at: 2026-11-08T09:34:39.137990+00:00
model: ollama:qwen3.8:27b
---

# tests/fuzz/ssrf-guard.fuzz.test.ts

## Purpose

Fixed-table test suite that validates `resolveSafeOutboundTarget` against a comprehensive catalogue of hostile URL patterns (private/loopback/link-local ranges, encoded IPv4 literals, IPv6 tunnel encodings, DNS-to-private, credentials, insecure schemes). Despite living under `tests/fuzz/`, it is deliberately deterministic: every case has one correct answer (refuse with a specific reason, or accept), so it uses a hand-written table rather than `fast-check` arbitrary generation.

## Key elements

- **Jest mock of `node:dns/promises`** — `resolve4`/`resolve6` are fully mocked so no test ever depends on a real DNS server.
- **`mockDns(v4, v6)`** — helper that configures the DNS mocks to resolve (or reject) with given addresses for a single test case.
- **`describe` blocks / `it.each` table** (~30 entries) covering:
  - Literal-IP hostiles: RFC 1918, loopback, link-local (cloud metadata), CGN, broadcast, unspecified, multicast, IPv6 loopback/ULA/link-local, IPv4-mapped IPv6, decimal/octal/hex-encoded IPv4, NAT64, 6to4, Teredo, benchmarking, class E, IETF, documentation, site-local.
  - Scheme & credential hostiles (refused before any DNS query).
  - DNS-resolving-to-private (fail-closed: one private among many still refuses; mixed-family still refuses; neither-record → `dns-resolution-failed`).
  - Literal IP never triggers a DNS query.
  - Pinned lookup: the returned `target.lookup` always answers the validated address (both `all: false` and `all: true` shapes), never re-resolving.
  - Registered exempt origin: exact-origin allowance, other-port refusal, other-host refusal, scheme/credential checks still apply, and re-refusal after `clearSsrfExemptOrigins()`.

## Relationships

- **`src/infrastructure/adapters/ssrf-guard.ts`** — system under test. This file imports `resolveSafeOutboundTarget` and `SsrfRefusedError`, and asserts on the `reason` field of the thrown error for every case.
- **`src/infrastructure/adapters/ssrf-exemptions.ts`** — imported for `registerSsrfExemptOrigin` / `clearSsrfExemptOrigins`; used to set up and tear down the exempt-origin state around the exemption describe block.

## Notes

- **Location rationale:** the file lives at `tests/fuzz/` (top-level), not under `src/modules/webhooks/tests/fuzz/`, because the guard is infrastructure; deleting the `webhooks` module must not delete these tests. The sibling `webhook-ssrf.fuzz.test.ts` keeps only redirect/timeout/plain-HTTP cases specific to `deliverWebhook`.
- **6to4 & Teredo literals** are included specifically because the guard's `embeddedIPv4()` helper does *not* unwrap them, making them a real bypass vector that a naïve range-list would miss.
- **Exemption tests use literal IPs** (e.g. `127.0.0.1:8443`) so that `resolveAllAddresses` returns the literal directly and no `mockDns` call is needed.
- The "pinned lookup" test asserts `dns.resolve4` was called exactly **once** across the entire scenario, proving the returned `lookup` closure does not re-query DNS.
