---
source: tests/fuzz/ssrf-guard.fuzz.test.ts
sha256: 0e5c17e70ec617fc45d4f387176c05adc787bd2be236294a4399dd20857ce849
generated_at: 2026-09-27T15:54:07.148543+00:00
model: ollama:qwen3.8:27b
---

# tests/fuzz/ssrf-guard.fuzz.test.ts

## Purpose

Deterministic table-driven test suite that exercises `resolveSafeOutboundTarget` (the SSRF guard) against a fixed set of well-known hostile-URL bypass techniques: private/loopback/link-local ranges, encoded IPv4 literals, IPv6-mapped and embedded IPv4 (6to4, Teredo), DNS names resolving to private space, insecure schemes, and embedded credentials. It is a fixed table, not a `fast-check` arbitrary, because the inputs are the known bypass vectors rather than random bytes.

## Key elements

- **`mockDns(v4, v6)`** — configures the mocked `resolve4`/`resolve6` to return a fixed address array or a rejection, making DNS-dependent cases deterministic.
- **Literal IP hostiles block** (~31 cases) — asserts `SsrfRefusedError` with `reason: 'unsafe-address'` for every non-public-unicast literal (RFC 1918, 1122, 3927, 6598, 919, IPv6 loopback/ULA/link-local, IPv4-mapped IPv6, decimal/octal/hex IPv4, NAT64, 6to4, Teredo, and other non-routable ranges).
- **Scheme / credential / invalid-URL block** — asserts `insecure-scheme`, `credentials-in-url`, and `invalid-url` rejections, and verifies no DNS query is issued.
- **DNS-resolved hostname block** — verifies fail-closed behavior when any one of several answers is private, mixed-family private v4, or complete resolution failure (`dns-resolution-failed`).
- **Pinned-lookup block** — confirms the returned `target.lookup` always returns the single validated address (never re-resolves) in both `{ all: false }` and `{ all: true }` shapes, and that `resolve4` was called exactly once total (TOCTOU guard).
- **`exemptHostname` block** — verifies a caller-supplied exact hostname exempts scheme and address checks, but still rejects embedded credentials and non-matching hostnames.

## Relationships

- **`src/infrastructure/adapters/ssrf-guard.ts`** — the module under test. The test imports `resolveSafeOutboundTarget` and `SsrfRefusedError` from it. The file's docblock references `ssrf-guard.ts`'s own module docblock for the 6to4/Teredo `embeddedIPv4()` gap.

## Notes

- Lives at `tests/fuzz/`, **not** under `src/modules/webhooks/tests/fuzz/`, because the guard is infrastructure-level. Deleting the `webhooks` module must not delete these tests. The webhook-specific fuzz file (`webhook-ssrf.fuzz.test.ts`) covers redirect/timeout/plain-HTTP cases that reach this same guard along the delivery path.
- DNS is fully mocked via `jest.mock('node:dns/promises')`; the suite must never depend on a real DNS server.
- The `require` of the mocked module (with an eslint-disable) exists solely to access the `jest.fn()` instances for per-test configuration.
- 6to4 and Teredo literals are explicitly in the table because `embeddedIPv4()` in the guard never unwraps them — they would otherwise pass every other range check as ordinary global addresses.
- The `exemptHostname` parameter is an exact string match on the hostname only; it does not create a blanket bypass (credentials are still rejected, other hostnames are still refused).
