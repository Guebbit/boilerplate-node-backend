---
source: tests/support/https-test-server.ts
sha256: aec88108dca71268f676504f4e8a963cad0d5158ed9367266225fc01f1070825
generated_at: 2026-09-23T20:11:50.335564+00:00
model: ollama:qwen3.8:27b
---

# tests/support/https-test-server.ts

## Purpose

A self-contained local HTTPS listener that integration tests start and tear down themselves. It exists so the webhooks delivery suite can verify a signed HTTP request actually arrived over TLS without depending on the Docker Compose `webhook-tester` service, and without requiring `openssl` on the machine running tests.

## Key elements

- **`TEST_CA_CERT`** (exported `Buffer`) — the self-signed `localhost-test-cert.pem` read at module load. Callers inject it as the `ca` entry in a per-request `node:https` mock.
- **`CapturedRequest`** (exported interface) — shape of one received request: `headers` and raw `body`.
- **`HttpsTestServer`** (exported interface) — handle returned by `startHttpsTestServer`: `url` (`https://127.0.0.1:<port>`), `requests()` (all captured, oldest first), `close()`.
- **`startHttpsTestServer(respond)`** (exported function) — creates an `https.createServer` on port 0 / `127.0.0.1` using the committed key/cert pair, captures every request's headers + body, and delegates the response to the caller-supplied `respond` callback. Resolves with an `HttpsTestServer`.
- **`readBody`** (internal) — collects all `data` chunks from an `IncomingMessage` and resolves with the UTF-8 string.

## Relationships

- **`src/modules/webhooks/tests/integration/delivery.test.ts`** — primary consumer. Imports `startHttpsTestServer` and `TEST_CA_CERT`, mocks `node:https` to inject `{ ca: [TEST_CA_CERT] }` into every outbound request, and also mocks the SSRF guard (a real loopback listener is always refused by the guard; that mock is independent of TLS).

## Notes

- **`NODE_TLS_REJECT_UNAUTHORIZED=0` does not work here.** Node reads that env var at process bootstrap, before any test file's top-level code executes, so setting it inside a suite has no effect. The only working approach is the per-request CA injection shown above.
- The cert/key PEMs are committed under `tests/support/fixtures/` specifically so no test machine needs `openssl` to generate them.
- Port 0 is requested; the actual port is read back from `server.address()` after the `listening` event.
- A real local listener binds to `127.0.0.1` (loopback), which the production SSRF guard will always reject. Tests must mock that guard separately — it is unrelated to the TLS setup in this file.
