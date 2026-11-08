---
source: tests/support/https-test-server.ts
sha256: 55472497526fd46c4e11e79f671288e162dfb84ac6027401b028e032af16988a
generated_at: 2026-11-08T09:55:38.707419+00:00
model: ollama:qwen3.8:27b
---

# tests/support/https-test-server.ts

## Purpose

Provides a self-contained, local HTTPS listener that integration tests can start and stop on demand. It exists so the webhook delivery suite can verify a signed HTTP delivery actually arrived over TLS without depending on the compose `webhook-tester` service or requiring `openssl` on the test machine.

## Key elements

- **`TEST_CA_CERT`** (exported `Buffer`) — the self-signed cert for `CN=localhost`/`127.0.0.1`, read from `fixtures/localhost-test-cert.pem`. Callers inject this into a `node:https` mock as the `ca` entry.
- **`LOCALHOST_CREDENTIALS`** (module-private) — the matching `{ key, cert }` pair the server presents by default.
- **`CapturedRequest`** (exported interface) — a single received request: `headers` and the decoded `body` string.
- **`HttpsTestServer`** (exported interface) — the handle returned to tests: `url` (e.g. `https://127.0.0.1:<port>`), `requests()` (oldest-first array of `CapturedRequest`), and `close()`.
- **`startHttpsTestServer(respond, credentials?)`** (exported function) — binds an OS-assigned port on `127.0.0.1`, captures every request body, then hands the response to the caller-supplied `respond` callback. Accepts an optional alternate credential pair.

## Relationships

- **`src/modules/webhooks/tests/integration/delivery.test.ts`** — primary consumer. It calls `startHttpsTestServer`, mocks `node:https` to inject `TEST_CA_CERT` into outgoing requests, and also mocks the SSRF guard (a real loopback listener would always be refused by the production guard). This test is the reference pairing documented in the module docblock.
- **`tests/support/webhook-receiver.ts`** — sibling test-support utility in the same directory; both provide local HTTP/HTTPS endpoints for webhook-related integration tests, but this file specifically handles the TLS-signed variant.

## Notes

- `NODE_TLS_REJECT_UNAUTHORIZED=0` does **not** work here. Node reads that env var at process bootstrap, before any test file's top-level code executes, so setting it inside a suite is a no-op. The working pattern is a per-request `node:https` mock that injects `{ ca: [TEST_CA_CERT] }`.
- The cert fixtures are committed intentionally; they are throwaway, self-signed, and not trusted by any real client.
- `respond` is called **after** the full body is read, so the callback always sees a complete request. If reading the body errors, the socket is destroyed with no response sent.
- Port `0` is passed to `listen()` to let the OS assign a free port; the actual port is read back from `server.address()`.
