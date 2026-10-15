---
source: tests/unit/scenarios/webhook-sink.test.ts
sha256: c162c8399bf9d21b7a1e76764d5af5bb94405c82fc8427cd520ffd188d9708e5
generated_at: 2026-10-15T13:25:02.004503+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/webhook-sink.test.ts

## Purpose

Unit tests for `registerWebhookSinkExemption`, verifying that it adds an SSRF-origin exemption and a TLS CA trust scoped to the demo webhook sink's full origin (host + port), and that it behaves safely when no sink is configured, the URL is malformed, or the function is called repeatedly.

## Key elements

- **`TLS_DIRECTORY`** — Resolved path to the committed test CA, leaf cert, and key under `scenarios/support/tls/`.
- **`ORIGINAL_ROOTS`** — Snapshot of the process-wide default CA certificates taken before any test runs, used for restoration and count assertions.
- **`afterEach` hook** — Calls `clearSsrfExemptOrigins()` and restores the original CA roots via `tls.setDefaultCACertificates`, preventing trust leakage between tests.
- **`handshakeWithSink(configure)`** — Spins up a one-shot TLS `https.createServer` on a free loopback port, invokes the caller-supplied `configure(origin)` callback, issues a single `request`, and resolves `true` if the TLS handshake and HTTP response succeed or `false` if the connection errors.
- **`describe('registerWebhookSinkExemption')`** — Seven test cases covering: port-specific exemption, no cross-port leakage, no exemption without a configured sink, non-URL input handled gracefully, successful TLS handshake against the test CA, public roots preserved alongside the added CA, idempotent CA registration, and no handshake success when no sink is set.

## Relationships

- **`scenarios/support/doubles/webhook-sink.ts`** — Source of the `registerWebhookSinkExemption` function under test.
- **`src/infrastructure/adapters/ssrf-exemptions.ts`** — Provides `isSsrfExemptOrigin` (assertion helper) and `clearSsrfExemptOrigins` (teardown).
- **`tests/support/environment.ts`** — Provides `setEnvironment` to set or clear `NODE_WEBHOOK_DEMO_SINK_URL` on a per-test basis.

## Notes

- Exemption is **whole-origin** (host *and* port). A matching host on a different port, or a host without a port, is never exempted.
- The test relies on `tls.setDefaultCACertificates` (Node ≥ 24.5) to restore process-wide trust; on older Node this call is a no-op and trust could leak.
- `handshakeWithSink` uses the callback form of `node:https` `request` and the server is closed inside both the success and error paths before resolving.
- The "keeps the public roots" and "adds the CA only once" tests assert exact certificate counts (`ORIGINAL_ROOTS.length + 1`) rather than checking for a specific cert by fingerprint.
- Test TLS material is loaded from a relative path (`../../../scenarios/support/tls`), so the file must not be moved without updating that path.
