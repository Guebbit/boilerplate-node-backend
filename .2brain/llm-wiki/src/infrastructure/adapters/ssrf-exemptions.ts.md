---
source: src/infrastructure/adapters/ssrf-exemptions.ts
sha256: 0c2bbf4d1092937ace1403a1209c46f9ca094b5f814ccc0159f384682c24cffe
generated_at: 2026-11-08T03:24:00.706829+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/ssrf-exemptions.ts

## Purpose

Holds a process-wide set of origins exempt from the SSRF guard's private-address check. Exists as a standalone module with **zero imports** so that dev preloads and Jest setup can register an exemption without pulling in `ssrf-guard.ts` (and its DNS dependencies) before a test's own DNS mock is in place. In production the set is always empty.

## Key elements

- **`exemptOrigins`** (module-private `Set<string>`) — the registry of exempt origins. Never exported directly.
- **`registerSsrfExemptOrigin(origin: string): void`** — adds one origin (full `https://host:port` string, as `URL.origin` writes it) to the set.
- **`clearSsrfExemptOrigins(): void`** — empties the set. Intended as a test teardown seam.
- **`isSsrfExemptOrigin(origin: string): boolean`** — membership check the guard calls before rejecting a resolved private address.

## Relationships

- **`src/infrastructure/adapters/ssrf-guard.ts`** — the consumer. Queries `isSsrfExemptOrigin` during its address-resolution step to decide whether to skip the private-IP rejection. The exemption relaxes *only* the address check; the `https:` scheme rule, credential stripping, URL parsing, and DNS resolution all still run.
- **`scenarios/support/doubles/webhook-sink.ts`** — the one caller of `registerSsrfExemptOrigin` in non-test code. It registers its own sink origin before the application module graph loads.
- **Test files** (`tests/unit/infrastructure/adapters/ssrf-guard.test.ts`, `tests/fuzz/ssrf-guard.fuzz.test.ts`, `tests/cross-cutting/ssrf-conformance.test.ts`, `src/modules/webhooks/tests/fuzz/webhook-ssrf.fuzz.test.ts`, `tests/integration/scenarios/webhooks-seed.test.ts`, `tests/support/webhook-receiver.ts`, `src/modules/webhooks/tests/contract/webhooks.contract.test.ts`, `tests/unit/scenarios/webhook-sink.test.ts`) — each registers an exemption in setup and calls `clearSsrfExemptOrigins` in teardown.

## Notes

- **Origin, not host.** The exempt value is the full origin string including port. A sink registered on `:3070` does *not* open every port on that host.
- **Single-check relaxation.** Registering an origin bypasses only the "resolves to a private address" gate. The guard's other invariants (scheme, credentials, parseability, DNS reachability) are untouched.
- **No imports by design.** This file must stay import-free. Adding a dependency here would break the guarantee that it can be loaded before Jest installs its DNS mock, causing the guard's real DNS code to execute at module-evaluation time.
- **Process-global, mutable.** There is no isolation between test files in the same worker; every suite that registers must clear. The `clearSsrfExemptOrigins` export is the only reset mechanism.
