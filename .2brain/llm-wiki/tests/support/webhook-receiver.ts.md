---
source: tests/support/webhook-receiver.ts
sha256: 0e306b72c023e3e877970898ac2fa71ff0f0638f81ef095c60739b33175d1a55
generated_at: 2026-11-08T10:02:14.684064+00:00
model: ollama:qwen3.8:27b
---

# tests/support/webhook-receiver.ts

## Purpose

A local HTTPS webhook subscriber for journey tests. It starts a TLS listener on `127.0.0.1` using the demo sink's certificate, registers the SSRF exemption so the real guard and TLS client run unmodified, and records every delivery (headers, body, signature-verification result) for assertions.

## Key elements

- **`SINK_CREDENTIALS`** — module-level constant holding the sink's leaf key/cert (loaded once from `scenarios/support/tls/`).
- **`ReceivedWebhook`** (interface) — shape of one recorded delivery: `id`, `type`, `body`, `signed`.
- **`WebhookReceiver`** (interface) — the handle returned to the test: `url`, `answerWith(status)`, `received(secrets)`, `stop()`.
- **`startWebhookReceiver()`** (exported async function) — the sole entry point. Starts the HTTPS server, sets the demo-sink env var, registers the SSRF exemption, and returns the `WebhookReceiver` handle.

## Relationships

- **`scenarios/support/doubles/webhook-sink.ts`** — calls `registerWebhookSinkExemption()` at startup so the SSRF guard allows the sink origin.
- **`src/infrastructure/adapters/ssrf-exemptions.ts`** — calls `clearSsrfExemptOrigins()` in `stop()` to undo the registration.
- **`src/modules/webhooks/tests/verify-signature.fixture.ts`** — uses `verifyWebhookSignatureForTest` inside `received()` to check each delivery's signature against the caller-supplied secrets.
- **`tests/support/https-test-server.ts`** — wraps the actual `tls.Server` creation and request capture.
- **`tests/support/environment.ts`** — calls `setEnvironment` so the process under test sees `NODE_WEBHOOK_DEMO_SINK_URL`.
- **`tests/support/paths.ts`** — provides `REPO_ROOT` to locate the TLS PEM files.
- **`tests/integration/journeys/a-receiver-that-stays-down.test.ts`**, **`tests/integration/journeys/an-integrator-start-to-finish.test.ts`** — journey tests that consume the returned handle (e.g. calling `answerWith(500)` to simulate a down subscriber).

## Notes

- Must be called **inside** the test case (before the subscription is created); it mutates process-global state (env vars, TLS roots, SSRF exemptions) that is expected to be reset per case.
- `stop()` must be awaited to restore the default CA bundle (`tls.setDefaultCACertificates`) and clear SSRF exemptions; skipping it leaks the sink's CA into subsequent cases.
- Relies on **Node ≥ 24.5** for `tls.setDefaultCACertificates` (see the inline comment).
- `received(secrets)` takes an array of candidate secrets so a test can verify which key a delivery was signed with; verification is lazy (per-call), not cached.
