---
source: tests/unit/infrastructure/adapters/ssrf-guard.test.ts
sha256: 4d0d30305e5e0e4948b61d7749627d86aa334129fe8fab4acda78950202acb6d
generated_at: 2026-11-08T10:10:50.474429+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/ssrf-guard.test.ts

## Purpose

Unit tests for `resolveSafeOutboundTarget` (the SSRF guard). Exercises address validation, port allow-lists, scheme/credential rejection, embedded-IPv4 forms, DNS resolution (fully mocked), origin exemptions, and abort-signal propagation — without any real network I/O.

## Key elements

- **`dns`** — typed references to the mocked `resolve4`/`resolve6` so tests can script or assert on per-family answers.
- **`mockDns(v4, v6?)`** — helper that wires both resolvers; passing an `Error` makes that family reject, otherwise it resolves the given string array. `v6` defaults to `ENODATA` (simulating a missing AAAA record).
- **`jest.mock('node:dns/promises')`** — replaces the entire DNS module so no case ever hits a real resolver.
- **`describe` blocks** (one per concern):
  - `::/96` deprecated IPv4-compatible block
  - Port rule (unsafe ports, `NODE_OUTBOUND_ALLOWED_PORTS`, exempt-origin port scoping)
  - Scheme / credentials (rejected before any DNS call)
  - 6to4 / NAT64 / Teredo rejection, IPv4-mapped literal acceptance, IPv6 literal pinning (family 6, brackets stripped)
  - Name resolution (mixed public/private, ENODATA one family, multi-answer pinning, malformed DNS)
  - Origin exemption (subdomain/suffix/prefix/trailing-dot exclusion, case-insensitivity, bracketed IPv6 literal)
  - Abort signal (already-aborted, non-Error reason wrapping, abort-during-pending-DNS)

## Relationships

- **`src/infrastructure/adapters/ssrf-guard.ts`** — the module under test; the sole function exercised is `resolveSafeOutboundTarget`.
- **`src/infrastructure/adapters/ssrf-exemptions.ts`** — provides `registerSsrfExemptOrigin` and `clearSsrfExemptOrigins`, used to set up and tear down exemption state in the port-rule and exemption describe blocks.
- **`tests/support/environment.ts`** — provides `setEnvironment` to inject `NODE_OUTBOUND_ALLOWED_PORTS` (and reset it to `undefined`) without mutating `process.env` directly.

## Notes

- The file explicitly defers the hostile-URL fuzz table to `tests/fuzz/ssrf-guard.fuzz.test.ts`; this file covers only deterministic unit cases.
- `beforeEach` resets both DNS mocks; exemption state is cleared in targeted `afterEach` hooks (not globally), so test order within a block matters.
- The abort-during-pending test uses `setImmediate` before triggering the abort so the code exercises the *listener* path rather than the already-aborted fast path.
- Lookup callback assertions rely on `isIP` from `node:net` to derive the expected `family` value, keeping them correct regardless of whether the pinned address is v4 or v6.
- Exemption matching is case-insensitive and exact-hostname; the tests verify that subdomains, suffixes, prefixes, and trailing-dot FQDNs are **not** exempted.
