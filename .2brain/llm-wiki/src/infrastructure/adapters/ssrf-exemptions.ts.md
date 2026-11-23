---
source: src/infrastructure/adapters/ssrf-exemptions.ts
source_sha256: 22f91212435c35a5eb7d9aad8e19e51fc40d0365df0dab274e61b3147d1e87ec
context_sha256: b8c074296da558b51e3d5b93529f86e2d22f48dcf474db3acf3621109d3679cc
generated_at: 2026-11-22T02:42:41.871284+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/ssrf-exemptions.ts

## Purpose
Holds the registry of origins that the SSRF guard (`./ssrf-guard`) allows to resolve to a private address. The registry is empty in production, because nothing in `src/` registers an origin. A development or demo process registers its own sink before the application loads. The file has no imports, so development doubles and the jest setup can register an origin without loading the guard and its DNS imports before a test's own DNS mock is in place.

## Key elements
- `exemptOrigins` (module-private): a `Set<string>` of origins in the form `https://host:port`. An exemption covers one host and one port, so a sink on `:3070` does not open the other ports on that machine.
- `registerSsrfExemptOrigin(origin)`: adds an origin, written as `URL.origin` writes it (e.g. `https://127.0.0.1:3070`). It relaxes only the address check. The `https:` rule, credential checks, parsing and DNS resolution still run in full.
- `clearSsrfExemptOrigins()`: empties the set. It is a test seam: a suite that registers an origin should reset it afterwards.
- `isSsrfExemptOrigin(origin)`: returns whether an origin was registered.

## Relationships
- `ssrf-guard.ts` is the consumer. It checks `isSsrfExemptOrigin` to decide whether to skip the private-address check.
- `scenarios/support/doubles/webhook-sink.ts` is the documented registrant in development and demo setups.
- Tests and support code that reference this file or exercise the exemption behavior: `tests/unit/infrastructure/adapters/ssrf-guard.test.ts`, `tests/cross-cutting/ssrf-conformance.test.ts`, `tests/fuzz/ssrf-guard.fuzz.test.ts`, `src/modules/webhooks/tests/fuzz/webhook-ssrf.fuzz.test.ts`, `src/modules/webhooks/tests/contract/webhooks.contract.test.ts`, `tests/integration/scenarios/webhooks-seed.test.ts`, `tests/unit/scenarios/webhook-sink.test.ts` and `tests/support/webhook-receiver.ts`.

## Notes
- Origins must be passed in the exact `URL.origin` form, because matching is exact string membership in the set.
- The state is process-global and mutable. Tests that register an origin should call `clearSsrfExemptOrigins()` afterwards to avoid leaking state between suites.
- Keep this file free of imports, since that is what lets it be loaded ahead of the guard.
