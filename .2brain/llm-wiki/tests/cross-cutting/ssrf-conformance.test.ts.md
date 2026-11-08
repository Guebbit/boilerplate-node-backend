---
source: tests/cross-cutting/ssrf-conformance.test.ts
sha256: 09739a851d86a79c145c30c2a01f0f19ddc29306acca94d53d62c789ae387d31
generated_at: 2026-11-08T09:32:56.595863+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/ssrf-conformance.test.ts

## Purpose

Conformance test that runs the shared SSRF case suite (`shared/cases/ssrf.cases.yaml`) against `resolveSafeOutboundTarget`, verifying that this TypeScript implementation answers every case identically to its PHP twin. All cases use literal IP addresses so no DNS resolution is involved.

## Key elements

- **`ssrfCase` (Zod schema)** — Discriminated union on `kind`: either an `address` case (literal IP + `expected: allowed|refused`) or a `url` case (full URL + free-form expected refusal reason).
- **`outcomeOf(url)`** — Helper that calls `resolveSafeOutboundTarget` and normalises the result to either `'allowed'` or the `SsrfRefusedError.reason` string. Non-SSRF errors are re-thrown.
- **`describeCases('ssrf', ssrfCase, …)`** — Main test block. For each case: clears exempt origins, then either asserts the exact URL outcome or wraps a literal IP in `https://[host]/` and asserts the binary outcome. Address refusals additionally assert the reason is `'unsafe-address'`.

## Relationships

- **`src/infrastructure/adapters/ssrf-guard.ts`** — Unit under test. Imports `resolveSafeOutboundTarget` (the function being exercised) and `SsrfRefusedError` (used to extract the refusal reason).
- **`src/infrastructure/adapters/ssrf-exemptions.ts`** — Imports `clearSsrfExemptOrigins`, called at the top of every case to reset any registered exemptions so cases don't leak state into each other.
- **`tests/support/cases.ts`** — Provides `caseBase` (shared Zod fields like `id`/`description`) and `describeCases` (the runner that loads the YAML file and drives `it` blocks).

## Notes

- IPv6 addresses are bracketed (`[::1]`) before being embedded in the URL; IPv4 are used as-is.
- Address cases only assert binary `allowed`/`refused`; the URL cases assert the exact reason string. This asymmetry exists because a URL can be refused for a reason *other than* the address (e.g. scheme, port), while an address can only be refused for its range.
- The test file does **not** import the YAML directly; `describeCases` handles loading from `shared/cases/ssrf.cases.yaml` internally.
