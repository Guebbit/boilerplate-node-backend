---
source: tests/cross-cutting/ssrf-conformance.test.ts
sha256: 3f6060638b97637a5bee5ce79832b72497dc09cae070492cf19457fcdc998de6
generated_at: 2026-10-29T06:50:24.682820+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/ssrf-conformance.test.ts

## Purpose

Conformance test that verifies the TypeScript SSRF outbound guard (`resolveSafeOutboundTarget`) answers a shared set of 49 cases identically to the PHP twin. All hosts are literal IPs, so no DNS resolution is exercised. The canonical case list lives in `shared/cases/ssrf.cases.yaml`.

## Key elements

- **`ssrfCase`** — Zod discriminated-union schema describing each case. Two variants: `address` (raw IP string + `'allowed' | 'refused'`) and `url` (full URL + free-form expected string).
- **`outcomeOf(url)`** — Thin wrapper around `resolveSafeOutboundTarget` that normalises the promise result to a string: `'allowed'` on success, or the `SsrfRefusedError.reason` on refusal.
- **`describeCases('ssrf', ssrfCase, 49, …)`** — Test runner body (via the shared harness). Dispatches by `kind`; for `address` cases it wraps IPv6 in brackets, prepends `https://`, and asserts the binary allowed/refused outcome plus a specific reason.

## Relationships

- **`src/infrastructure/adapters/ssrf-guard.ts`** — System under test. Imports `resolveSafeOutboundTarget` (the guard) and `SsrfRefusedError` (to read `.reason`).
- **`src/infrastructure/adapters/ssrf-exemptions.ts`** — Imports `clearSsrfExemptOrigins`, called before every case to reset exemption state and prevent cross-case leakage.
- **`tests/support/cases.ts`** — Provides `caseBase` (shared Zod base schema) and `describeCases` (the runner that loads the YAML case file and drives the per-case callback).

## Notes

- The expected case count is hard-coded as `49` in the `describeCases` call; adding/removing a case in the YAML file without updating this number will fail the suite.
- For `address`-kind refusals, the test asserts the reason is exactly `'unsafe-address'` (i.e., the URL is syntactically valid but the IP range is blocked), distinguishing it from other refusal reasons a `url`-kind case might produce.
- IPv6 addresses are bracketed manually (`[::1]`) before being embedded in the URL; no URL-parsing library is relied upon for this formatting.
