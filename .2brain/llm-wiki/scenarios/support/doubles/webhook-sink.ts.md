---
source: scenarios/support/doubles/webhook-sink.ts
sha256: c4a3f9441e9d55873c27b852276ce8d08e3b46524c02ea923b0c92f56e1c8880
generated_at: 2026-10-14T07:05:12.957055+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/webhook-sink.ts

## Purpose

Test-double helper that registers the demo webhook sink's origin as an SSRF exemption and adds its test CA to the process's trusted TLS roots. It exists so the sink (a `webhook-tester` instance behind a TLS proxy, or the frontend's Cypress listener) can be reached over loopback/private compose addresses without modifying production SSRF-guard logic. No-op unless `NODE_WEBHOOK_DEMO_SINK_URL` is set to a parseable URL.

## Key elements

- **`registerWebhookSinkExemption()`** *(exported)* — Reads `NODE_WEBHOOK_DEMO_SINK_URL` from the current environment. If unset or unparseable, returns immediately. Otherwise registers the sink's origin (scheme + host + port) via `registerSsrfExemptOrigin` and calls `trustSinkCertificateAuthority`.
- **`trustSinkCertificateAuthority()`** *(module-private)* — Reads the committed test CA PEM, checks idempotency against `tls.getCACertificates('default')`, then calls `tls.setDefaultCACertificates` with the existing roots **plus** the sink CA.
- **`SINK_CA_PATH`** *(module-private const)* — Resolves to `scenarios/support/tls/webhook-sink-ca.pem` relative to this file.

## Relationships

- **`src/infrastructure/adapters/ssrf-exemptions.ts`** — Provides `registerSsrfExemptOrigin`, which this file calls to whitelist the sink origin in the SSRF guard.
- **`src/infrastructure/config/store.ts`** — Provides `currentEnvironment`, used to read `NODE_WEBHOOK_DEMO_SINK_URL`.
- **`scenarios/support/doubles/register.ts`** — Dev-preload entry point that calls `registerWebhookSinkExemption` during process startup.
- **`tests/unit/scenarios/webhook-sink.test.ts`** — Unit-tests the exemption registration and CA-trust logic.
- **`tests/integration/scenarios/webhooks-seed.test.ts`** — Exercises the sink end-to-end, relying on this file having been registered first.

## Notes

- `tls.setDefaultCACertificates` **replaces** the entire default root list; the code deliberately prepends existing defaults so the public CA bundle is not lost.
- Relies on Node ≥ 24.5 APIs (`tls.getCACertificates`, `tls.setDefaultCACertificates`).
- The exemption is scoped to the exact origin (including port) via WHATWG `URL.origin`, so a sink on `:3070` does not open other ports on the same host.
- The module is intentionally side-effect-free until `registerWebhookSinkExemption` is explicitly invoked; it is never imported by production code paths.
