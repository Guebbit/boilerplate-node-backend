---
source: tests/unit/scenarios/webhook-sink.test.ts
sha256: c162c8399bf9d21b7a1e76764d5af5bb94405c82fc8427cd520ffd188d9708e5
generated_at: 2026-11-08T10:31:28.368517+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/webhook-sink.test.ts

## Purpose

Unit tests for `registerWebhookSinkExemption` — the function that grants the demo webhook sink an SSRF exemption and injects its test CA into Node's trust store. Verifies the exemption is origin-scoped (host **and** port), idempotent, and that no trust is added when the sink URL is absent or invalid.

## Key elements

- **`handshakeWithSink(configure)`** – Spins up an ephemeral HTTPS server on `127.0.0.1` using the committed test cert/key from `scenarios/support/tls/`, calls it once via `node:https`, and resolves `true`/`false` based on whether the TLS handshake succeeded. The `configure` callback receives the resolved origin so the test can register the exemption before the request fires.
- **`ORIGINAL_ROOTS`** – Snapshot of `tls.getCACertificates('default')` taken at module load, used to assert root-count deltas and to restore state in `afterEach`.
- **`afterEach`** – Clears SSRF exempt origins and restores the original CA roots, preventing cross-test contamination of the process-wide TLS store.
- **`describe('registerWebhookSinkExemption')`** – Eight tests covering: port-precise exemption; rejection of a different port or bare host; no-op when `NODE_WEBHOOK_DEMO_SINK_URL` is `undefined`; no-throw on a non-URL value; successful TLS handshake when the sink is configured; public roots preserved alongside the test CA; idempotency of repeated registration; and handshake failure when no sink is set.

## Relationships

- **`scenarios/support/doubles/webhook-sink.ts`** – Provides `registerWebhookSinkExemption`, the function under test.
- **`src/infrastructure/adapters/ssrf-exemptions.ts`** – Provides `isSsrfExemptOrigin` (assertion helper) and `clearSsrfExemptOrigins` (cleanup in `afterEach`).
- **`tests/support/environment.ts`** – Provides `setEnvironment` to inject or clear `NODE_WEBHOOK_DEMO_SINK_URL` per test without touching real env vars.

## Notes

- The exemption is **origin-scoped** (includes port). A test that asserts `127.0.0.1:3070` is exempt must not expect `127.0.0.1` or `127.0.0.1:3071` to be exempt.
- `registerWebhookSinkExemption` mutates **process-wide** TLS state via `tls.setDefaultCACertificates`. The `afterEach` restoration is load-bearing; removing it will cause later tests to inherit the test CA.
- Test certificates live at a path resolved relative to `__dirname` (`../../../scenarios/support/tls/`), not a fixture directory — they are committed source files, not generated artifacts.
- The `handshakeWithSink` helper always closes the server before resolving; it is safe to call once per test without a separate teardown.
