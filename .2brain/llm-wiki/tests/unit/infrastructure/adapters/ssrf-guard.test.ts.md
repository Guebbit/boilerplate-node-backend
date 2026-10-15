---
source: tests/unit/infrastructure/adapters/ssrf-guard.test.ts
sha256: 4d0d30305e5e0e4948b61d7749627d86aa334129fe8fab4acda78950202acb6d
generated_at: 2026-10-15T13:09:54.373719+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/ssrf-guard.test.ts

## Purpose

Unit tests for `resolveSafeOutboundTarget`, the SSRF guard that validates outbound URL targets before a request is made. The file exercises address-class rules (private ranges, embedded IPv4, deprecated `::/96`), port policy, scheme/credential rejection, name-resolution pinning, origin exemptions, and abort-signal handling — all with DNS fully mocked so no test depends on a live resolver.

## Key elements

- **`mockDns(v4, v6)`** — helper that scripts `resolve4`/`resolve6` to return the given arrays or reject with the given `Error`; `v6` defaults to an `ENODATA` rejection.
- **`dns`** — typed references to the two jest-mocked resolvers (`resolve4`, `resolve6`) so individual cases can assert call counts or re-mock them.
- **`jest.mock('node:dns/promises', …)`** — module-level mock ensuring no real DNS I/O occurs.
- **`describe` blocks** — one per concern: `::/96` block, port rule, scheme/credentials, embedding forms & IPv4-mapped literals, name resolution (pinning, mixed families, malformed answers), origin exemption (exact-match, case-insensitivity, subdomain/suffix/prefix rejection, bracketed IPv6), and abort signal.
- **`setEnvironment({ NODE_OUTBOUND_ALLOWED_PORTS })`** — sets the operator-configured allow-list of extra ports within a single test.
- **`registerSsrfExemptOrigin` / `clearSsrfExemptOrigins`** — registers and tears down an origin exemption for tests that exercise the exemption path.

## Relationships

- **`src/infrastructure/adapters/ssrf-guard.ts`** — the system under test; this file calls `resolveSafeOutboundTarget` and asserts its resolved `target` object (including its `lookup` callback) or the specific `reason` it rejects with.
- **`src/infrastructure/adapters/ssrf-exemptions.ts`** — provides `registerSsrfExemptOrigin` and `clearSsrfExemptOrigins`, which the exemption and port-rule tests use to set up and clean up exempt origins.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used to toggle `NODE_OUTBOUND_ALLOWED_PORTS` for the operator-allow-list tests and reset it in `afterEach`.

## Notes

- **Pinning semantics are central.** After a successful resolve, every subsequent `target.lookup(…)` call (single or `all`) must return the *one* pinned address and its IP family, regardless of the hostname passed to the callback. Several tests assert this explicitly with `isIP` to derive the family.
- **Credentials are refused even on exempt origins.** The exemption bypasses the address-class check, not the scheme/credential checks.
- **Exemption matching is exact (case-insensitive) and literal.** Subdomains, suffixes, prefixes, trailing-dot FQDNs, and neighbouring IPs (e.g. `127.0.0.1` vs `127.0.0.10`) are all *not* exempt.
- **The hostile/fuzz URL table is intentionally excluded** from this file; it lives in `tests/fuzz/ssrf-guard.fuzz.test.ts` (noted in the in-file comment).
- **Abort-signal tests use `setImmediate`** to let the DNS promise go pending before triggering the abort, ensuring the in-flight listener path is exercised rather than the already-aborted short-circuit.
