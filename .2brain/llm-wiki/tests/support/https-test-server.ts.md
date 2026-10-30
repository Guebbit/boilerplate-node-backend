---
source: tests/support/https-test-server.ts
sha256: 55472497526fd46c4e11e79f671288e162dfb84ac6027401b028e032af16988a
generated_at: 2026-10-29T07:08:36.365853+00:00
model: ollama:qwen3.8:27b
---

# tests/support/https-test-server.ts

## Purpose

Provides a self-contained, local HTTPS listener that integration tests can start on demand and stop when done. It exists so the webhook delivery suite can verify a signed HTTPS response end-to-end without depending on the Docker Compose `webhook-tester` service, and without requiring `openssl` on the CI/dev machine (the self-signed cert pair is committed under `fixtures/`).

## Key elements

- **`TEST_CA_CERT`** (`Buffer`) — the fixture's own certificate read into memory; callers pass it into a `node:https` mock to satisfy per-request TLS verification.
- **`LOCALHOST_CREDENTIALS`** (module-private) — the key/cert pair the server serves by default.
- **`CapturedRequest`** (interface) — `{ headers, body }` snapshot of a single received request.
- **`HttpsTestServer`** (interface) — the handle returned by `startHttpsTestServer`: exposes `url`, `requests()` (all captured requests, oldest first), and `close()`.
- **`startHttpsTestServer(respond, credentials?)`** — creates an `https.createServer` on port 0 at `127.0.0.1`, reads each request body fully, records it, then hands the `ServerResponse` to the caller-supplied `respond` callback. Returns a promise that resolves once the port is bound.
- **`readBody`** (module-private) — streams an `IncomingMessage` to completion and resolves the concatenated UTF-8 string.

## Relationships

- **`src/modules/webhooks/tests/integration/delivery.test.ts`** — primary consumer. Imports `TEST_CA_CERT` and `startHttpsTestServer`. That test also mocks `node:https` to inject `{ ca: [TEST_CA_CERT] }` into every outgoing request, and separately mocks the SSRF guard (a real loopback listener is always refused by the production guard).
- **`tests/support/webhook-receiver.ts`** — listed in the dependency graph; no direct import or reference appears in this file's source.

## Notes

- `NODE_TLS_REJECT_UNAUTHORIZED=0` set inside a test file has **no effect**: Node reads that env var at process bootstrap, before any test code runs. The working pattern is the per-request `ca` injection via a `node:https` mock (documented in the module docblock with a ready-to-copy snippet).
- The server binds to `127.0.0.1` only and picks an OS-assigned port (`listen(0, …)`), so parallel test workers never collide.
- If the request body errors mid-stream, the socket is destroyed with no response — there is no partial-capture entry.
- `credentials` parameter defaults to the committed localhost pair; passing a different pair is the escape hatch for tests that need a non-localhost identity.
