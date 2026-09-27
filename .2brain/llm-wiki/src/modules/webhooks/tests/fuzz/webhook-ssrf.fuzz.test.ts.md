---
source: src/modules/webhooks/tests/fuzz/webhook-ssrf.fuzz.test.ts
sha256: 07771aa8310a40ede55fa34b370945b3f60c9ac891c4b000cdf3527146b7cc9b
generated_at: 2026-09-27T15:45:26.093056+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/fuzz/webhook-ssrf.fuzz.test.ts

## Purpose

Fuzz-style test suite that pins down the SSRF-adjacent behaviour living *inside* `deliverWebhook` (timeout budget, redirect refusal, plain-HTTP exemption) as distinct from the generic SSRF guard's own hostile-URL table (covered by `ssrf-guard.fuzz.test.ts`). It exists so that deleting the `webhooks` module does not accidentally delete the guard's only tests, and so that delivery-path-specific security invariants have dedicated, deterministic coverage.

## Key elements

- **`mockDns(v4, v6)`** – helper that configures the mocked `resolve4`/`resolve6` to either resolve to a given address array or reject with a given error, making DNS outcomes deterministic per-test.
- **`describe` – "total timeout covers DNS resolution too"** – asserts that a hung resolver consumes the entire `timeoutMs` budget and the HTTP POST is never issued (`httpsRequest` not called).
- **`describe` – "a redirect is a failed delivery, never followed"** – simulates a 302 response via a mocked `node:https` request; asserts exactly one request is made, `success` is false, and the error mentions "redirect".
- **`describe` – "speaks plain HTTP only to an exempted http: target"** – exercises the `allowedInsecureHost` path; asserts `node:http` is used (not `node:https`) and the delivery succeeds with a 200.
- **Mocks** – `node:dns/promises`, `node:https`, and `node:http` are all replaced at module level; `EventEmitter` instances stand in for Node's `IncomingMessage`/`ClientRequest` objects.

## Relationships

- **Imports `deliverWebhook`** from `src/modules/webhooks/transport/webhook-delivery.ts` – this is the sole system under test; every assertion exercises that function's behaviour.
- **Sister file `tests/fuzz/ssrf-guard.fuzz.test.ts`** (referenced in the header comment, not in the graph) – owns the generic guard's hostile-URL table; this file intentionally does not duplicate that coverage.

## Notes

- The `dns` object is obtained via `require` (eslint-disabled) specifically to reach the `jest.fn()` handles that `jest.mock` injects; a top-level `import` would give the real module shape.
- Mocked HTTP responses use `EventEmitter`, not `EventTarget`, because `webhook-delivery.ts` calls `.on`/`.resume` in the Node `EventEmitter` style. The `unicorn/prefer-event-target` lint is suppressed for this reason.
- `beforeEach` resets only the DNS mocks; the `node:https`/`node:http` mocks are configured per-test via `mockImplementation`, so they are not reset between cases.
- The suite is labelled "fuzz" but is deterministic by design (all DNS and socket I/O are mocked); "fuzz" here signals the security-adversarial intent rather than random-input generation.
