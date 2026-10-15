---
source: src/modules/webhooks/tests/fuzz/webhook-ssrf.fuzz.test.ts
sha256: 5cb82e9dbbf411643662636a4d17f54ec43768d963d5048a713f76d96d10fdb9
generated_at: 2026-10-15T12:23:07.781377+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/fuzz/webhook-ssrf.fuzz.test.ts

## Purpose

Fuzz-style tests for the SSRF-adjacent behaviour that lives inside `deliverWebhook` itself — the shared timeout budget (DNS + request), redirect refusal, the demo-host exemption, and non-443 port rejection. It complements `ssrf-guard.fuzz.test.ts`, which covers the generic guard; this file covers the delivery path that *reaches* the guard but is not owned by it.

## Key elements

- **`mockDns(v4, v6?)`** — helper that wires `resolve4`/`resolve6` to either resolve an address array or reject, making DNS deterministic for every test.
- **`jest.mock('node:dns/promises')`** — prevents any real DNS lookup during tests.
- **`jest.mock('node:https')`** — replaces the actual socket layer so 3xx/200 responses are simulated without a server.
- **`describe: total timeout covers DNS resolution too`** — asserts a hung resolver exhausts the single `timeoutMs` budget and the POST is never issued.
- **`describe: redirect is a failed delivery, never followed`** — asserts a 302 is reported as failure (`statusCode: 302`) and exactly one `httpsRequest` call occurs (no `Location` chase).
- **`describe: exempted demo host is still https-only`** — uses `registerSsrfExemptOrigin` / `clearSsrfExemptOrigins` to verify a private address succeeds over `https://127.0.0.1:8443` but `http://127.0.0.1:8080` is refused with no connection opened.
- **`describe: port other than 443 is refused`** — parameterised over ports 22, 5432, 6379; asserts zero `httpsRequest` calls.

## Relationships

- **`src/modules/webhooks/transport/webhook-delivery.ts`** — the unit under test; `deliverWebhook` is the sole production import.
- **`src/infrastructure/adapters/ssrf-exemptions.ts`** — provides `registerSsrfExemptOrigin` and `clearSsrfExemptOrigins`, used in the demo-host block to set up and tear down the exemption table per test.

## Notes

- The generic SSRF guard's hostile-URL table is deliberately **not** duplicated here; it lives in `ssrf-guard.fuzz.test.ts`. Deleting the `webhooks` module must not delete the guard's only tests.
- `dns` is re-required via `require()` (with an eslint-disable) because the mock's `jest.fn()` references are needed for per-test `mockImplementation` — a plain `import` binding would not expose them.
- The HTTP response mock uses `EventEmitter` (not `EventTarget`) to match Node's real `IncomingMessage` shape that `webhook-delivery.ts` calls; an `EventTarget` double would not satisfy the internal `.on('data')` / `.resume()` contract.
- All tests are network-free: neither DNS nor a TCP socket is ever real.
