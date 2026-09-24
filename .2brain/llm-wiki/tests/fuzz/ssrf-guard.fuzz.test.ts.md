---
source: tests/fuzz/ssrf-guard.fuzz.test.ts
sha256: d574557d8c208ce0f9f2aac865f05bf2f4684ecbb19eac0e80a3c1588f5d12dc
generated_at: 2026-09-23T20:01:54.868356+00:00
model: ollama:qwen3.8:27b
---

# tests/fuzz/ssrf-guard.fuzz.test.ts

## Purpose

Fixed-table test suite for the SSRF guard's `resolveSafeOutboundTarget` function, exercising a curated set of known-bypass hostile URLs (private ranges, loopback, link-local, encoded IPv4 literals, 6to4/Teredo embeddings, credentials, insecure schemes) and verifying the guard either rejects with the correct `SsrfRefusedError` reason or returns a pinned lookup. Despite the `fuzz` directory name, cases are deterministic — every input has one correct answer — so this is a regression table, not a `fast-check` property test.

## Key elements

- **`mockDns(v4, v6)`** — helper that configures the mocked `dns.resolve4`/`resolve6` to return the given address arrays or rejection errors, enabling deterministic "DNS resolves to private space" scenarios.
- **`describe("literal IP hostiles…")`** — 22-entry `it.each` table covering RFC 1918, 1122 loopback, 3927 link-local (cloud metadata), 6598 CGNAT, broadcast, unspecified, multicast, IPv6 loopback/ULA/link-local, IPv4-mapped IPv6, decimal/octal/hex-encoded IPv4, NAT64, 6to4, and Teredo encodings. All must be refused with `reason: 'unsafe-address'`.
- **`describe("scheme and credential hostiles…")`** — verifies `http://` is refused (`insecure-scheme`), embedded credentials are refused (`credentials-in-url`), and non-URL strings are refused (`invalid-url`), all _before_ any DNS call.
- **`describe("hostname whose DNS answer is private space")`** — five cases: sole private answer, multi-answer with one private (fail-closed), mixed v4-private/v6-public, public-only (accepted, `resolvedAddress` asserted), and both record types failing (`dns-resolution-failed`).
- **`describe("literal IP never triggers a DNS query")`** — asserts `resolve4`/`resolve6` are never called for a public literal IPv4.
- **`describe("the pinned lookup it hands back")`** — verifies `target.lookup` returns the same validated address for both `{ all: false }` and `{ all: true }` shapes, and that the DNS mock was consulted exactly once total (no re-resolution).
- **`describe("the exemptHostname parameter")`** — three cases showing `exemptHostname` bypasses scheme + address checks for the exact literal IP, but does _not_ bypass credential checks, and does not apply to a different hostname.

## Relationships

- **`src/infrastructure/adapters/ssrf-guard.ts`** — the sole dependency under test. This file imports `resolveSafeOutboundTarget` (the main entry point) and `SsrfRefusedError` (the rejection type) from that adapter and asserts on the `reason` discriminator attached to it. The adapter's own module docblock documents the 6to4/Teredo gap that the test table explicitly covers.
- **`node:dns/promises`** (mocked) — the only external I/O the guard performs; the test replaces it via `jest.mock` so no real DNS resolution ever occurs.

## Notes

- **Path rationale (documented in file header):** the guard is infrastructure, not a `webhooks` concern. `webhooks` is the only caller _today_, but its tests live under `src/modules/webhooks/tests/fuzz/`. This file stays at the infrastructure level so deleting the webhooks module cannot orphan the guard's test coverage.
- **Not a true fuzzer:** the `fuzz` directory name is a convention for "adversarial input" suites in this repo; the inputs are a hand-picked table of known bypass techniques, not generated.
- **DNS mock is mandatory:** the `dns.promises` module is mocked at the top of the file. Any test that exercises a hostname path must call `mockDns(...)` first; `beforeEach` resets the mocks. Forgetting this causes silent `ENOTFOUND` rejections that look like a guard bug but are actually unconfigured test state.
- **`exemptHostname` does not weaken credential checks:** even the exempted hostname still rejects `user:pass@` URLs. This is an intentional invariant tested explicitly.
